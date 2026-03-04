import { NextResponse } from "next/server";
import { activeEvent } from "@/lib/server";
import { adjustedStrokesForInput, calculateCallawayResult, rankGrossLeaderboard, sharedPlacings, toFrontBackTotals, type LeaderboardRow } from "@/lib/callaway";
import { HOLE_MAP } from "@/lib/course";
import { roundOnePositions } from "@/lib/ambrose";
import { prisma } from "@/lib/db";

export async function GET() {
  const event = await activeEvent();
  const fullEvent = await prisma.event.findUnique({
    where: { id: event.id },
    include: {
      players: {
        include: {
          rounds: { include: { scores: true } },
          ambroseMembership: { include: { group: { include: { members: true } } } }
        },
        orderBy: { order: "asc" }
      },
      ambroseGroups: {
        include: {
          members: {
            include: {
              player: {
                include: {
                  rounds: { include: { scores: true } }
                }
              }
            }
          }
        },
        orderBy: { groupNumber: "asc" }
      }
    }
  });

  if (!fullEvent) {
    return NextResponse.json({ error: "No leaderboard" }, { status: 404 });
  }
  const eventData = fullEvent;

  const roundOnePositionMap = new Map((await roundOnePositions(event.id)).map((entry) => [entry.playerId, entry.position]));

  const callawaySettings = {
    maxDoubleParEnabled: eventData.maxDoubleParEnabled,
    capDeductionPerHoleDoublePar: eventData.capDeductionPerHoleDoublePar,
    excludeWorseThanDoubleBogey: eventData.excludeWorseThanDoubleBogey
  };

  function rowForPlayerRound(player: (typeof eventData.players)[number], roundNumber: 1 | 2): LeaderboardRow {
    const round = player.rounds.find((candidate) => candidate.roundNumber === roundNumber);
    const scores = (round?.scores ?? []).map((score) => ({
      holeNumber: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, eventData.maxDoubleParEnabled)
    }));

    const totals = toFrontBackTotals(scores);
    const completedParTotal = scores.reduce((sum, score) => sum + (HOLE_MAP.get(score.holeNumber)?.par ?? 0), 0);
    const grossTotal = scores.reduce((sum, score) => sum + score.rawStrokes, 0);

    if (roundNumber === 2 && player.ambroseMembership) {
      const memberIds = player.ambroseMembership.group.members.map((member) => member.playerId);
      const handicap = memberIds.reduce((sum, playerId) => sum + (roundOnePositionMap.get(playerId) ?? 16), 0);
      return {
        playerId: player.id,
        playerName: player.name,
        holesCompleted: scores.length,
        frontNine: totals.frontNine,
        backNine: totals.backNine,
        grossTotal,
        grossToPar: scores.length === 0 ? null : grossTotal - completedParTotal,
        adjustedGross: grossTotal,
        handicapAllowance: handicap,
        netScore: grossTotal - handicap
      };
    }

    const callaway = calculateCallawayResult(scores, callawaySettings);
    return {
      playerId: player.id,
      playerName: player.name,
      holesCompleted: scores.length,
      frontNine: totals.frontNine,
      backNine: totals.backNine,
      grossTotal: callaway.grossTotal,
      grossToPar: scores.length === 0 ? null : callaway.grossTotal - completedParTotal,
      adjustedGross: callaway.adjustedGross,
      handicapAllowance: callaway.handicapAllowance,
      netScore: callaway.netScore
    };
  }

  const round1Rows = eventData.players.map((player) => rowForPlayerRound(player, 1));
  const round2Rows = eventData.players.map((player) => rowForPlayerRound(player, 2));

  const weekendRows: LeaderboardRow[] = eventData.players.map((player) => {
    const r1 = rowForPlayerRound(player, 1);
    const r2 = rowForPlayerRound(player, 2);
    return {
      playerId: player.id,
      playerName: player.name,
      holesCompleted: r1.holesCompleted + r2.holesCompleted,
      frontNine: r1.frontNine + r2.frontNine,
      backNine: r1.backNine + r2.backNine,
      grossTotal: r1.grossTotal + r2.grossTotal,
      grossToPar: r1.grossToPar === null && r2.grossToPar === null ? null : (r1.grossToPar ?? 0) + (r2.grossToPar ?? 0),
      adjustedGross: r1.adjustedGross + r2.adjustedGross,
      handicapAllowance: r1.handicapAllowance + r2.handicapAllowance,
      netScore: r1.netScore + r2.netScore
    };
  });

  const rounds = eventData.players.flatMap((player) =>
    player.rounds
      .filter((round) => round.roundNumber === eventData.activeRoundNumber)
      .map((round) => ({ ...round, scores: round.scores }))
  );

  const holeProgress = Array.from({ length: 18 }, (_, i) => {
    const hole = i + 1;
    const entries = rounds.flatMap((round) => round.scores.filter((score) => score.holeNumber === hole));
    const distribution = entries.reduce<Record<string, number>>((acc, score) => {
      const key = String(score.strokesRaw);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      hole,
      completed: entries.length,
      distribution
    };
  });

  const teamRows = eventData.ambroseGroups.map((group) => {
    const firstMember = group.members[0];
    const round = firstMember?.player.rounds.find((entry) => entry.roundNumber === 2);
    const scores = round?.scores ?? [];
    const grossTotal = scores.reduce((sum, score) => sum + score.strokesRaw, 0);
    const handicap = group.members.reduce((sum, member) => sum + (roundOnePositionMap.get(member.playerId) ?? 16), 0);

    return {
      groupId: group.id,
      groupNumber: group.groupNumber,
      players: group.members.map((member) => member.player.name),
      handicap,
      grossTotal,
      netScore: grossTotal - handicap,
      holesCompleted: scores.length
    };
  });

  const rankedTeams = [...teamRows].sort((a, b) => a.netScore - b.netScore || a.grossTotal - b.grossTotal);
  const teamsWithPlaces = rankedTeams.map((team, index) => ({ ...team, place: index + 1 }));

  return NextResponse.json({
    event: {
      name: eventData.name,
      date: eventData.eventDate,
      activeRoundNumber: eventData.activeRoundNumber,
      totalRounds: eventData.totalRounds,
      settings: {
        maxDoubleParEnabled: eventData.maxDoubleParEnabled,
        capDeductionPerHoleDoublePar: eventData.capDeductionPerHoleDoublePar,
        excludeWorseThanDoubleBogey: eventData.excludeWorseThanDoubleBogey,
        ambroseRequiredDrivesPerPlayer: eventData.ambroseRequiredDrivesPerPlayer,
        callawayTableVersion: eventData.callawayTableVersion
      }
    },
    weekend: {
      net: sharedPlacings(weekendRows),
      gross: rankGrossLeaderboard(weekendRows)
    },
    round1: {
      net: sharedPlacings(round1Rows),
      gross: rankGrossLeaderboard(round1Rows)
    },
    round2: {
      net: sharedPlacings(round2Rows),
      gross: rankGrossLeaderboard(round2Rows),
      teams: teamsWithPlaces
    },
    holeProgress
  });
}
