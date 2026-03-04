import { prisma } from "@/lib/db";
import { HOLE_MAP } from "@/lib/course";
import { roundOnePositions } from "@/lib/ambrose";
import {
  adjustedStrokesForInput,
  calculateCallawayResult,
  rankGrossLeaderboard,
  sharedPlacings,
  toFrontBackTotals,
  type HoleScoreInput,
  type LeaderboardRow
} from "@/lib/callaway";

export async function buildLeaderboard(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      players: {
        include: {
          ambroseMembership: {
            include: {
              group: {
                include: { members: true }
              }
            }
          },
          rounds: { include: { scores: true } }
        },
        orderBy: { order: "asc" }
      }
    }
  });

  if (!event) {
    return null;
  }

  const roundOnePositionMap = new Map((await roundOnePositions(event.id)).map((entry) => [entry.playerId, entry.position]));

  const rows: LeaderboardRow[] = event.players.map((player) => {
    const rounds = Array.from({ length: event.totalRounds }, (_, index) => index + 1).map((roundNumber) =>
      player.rounds.find((round) => round.roundNumber === roundNumber)
    );

    let holesCompleted = 0;
    let frontNine = 0;
    let backNine = 0;
    let grossTotal = 0;
    let adjustedGross = 0;
    let handicapAllowance = 0;
    let netScore = 0;
    let completedParTotal = 0;

    for (const round of rounds) {
      const scores: HoleScoreInput[] = (round?.scores ?? []).map((score) => ({
        holeNumber: score.holeNumber,
        rawStrokes: score.strokesRaw,
        adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, event.maxDoubleParEnabled)
      }));

      const isRoundTwo = round?.roundNumber === 2;
      const hasAmbroseGroup = !!player.ambroseMembership;

      const callaway = calculateCallawayResult(scores, {
        maxDoubleParEnabled: event.maxDoubleParEnabled,
        capDeductionPerHoleDoublePar: event.capDeductionPerHoleDoublePar,
        excludeWorseThanDoubleBogey: event.excludeWorseThanDoubleBogey
      });

      const totals = toFrontBackTotals(scores);
      holesCompleted += scores.length;
      frontNine += totals.frontNine;
      backNine += totals.backNine;
      grossTotal += callaway.grossTotal;
      adjustedGross += callaway.adjustedGross;
      if (isRoundTwo && hasAmbroseGroup) {
        const memberIds = player.ambroseMembership?.group.members.map((member) => member.playerId) ?? [];
        const handicap = memberIds.reduce((sum, playerId) => sum + (roundOnePositionMap.get(playerId) ?? 16), 0);
        handicapAllowance += handicap;
        netScore += callaway.grossTotal - handicap;
      } else {
        handicapAllowance += callaway.handicapAllowance;
        netScore += callaway.netScore;
      }
      completedParTotal += scores.reduce((sum, score) => {
        const holeMeta = HOLE_MAP.get(score.holeNumber);
        return sum + (holeMeta?.par ?? 0);
      }, 0);
    }

    return {
      playerId: player.id,
      playerName: player.name,
      holesCompleted,
      frontNine,
      backNine,
      grossTotal,
      grossToPar: holesCompleted === 0 ? null : grossTotal - completedParTotal,
      adjustedGross,
      handicapAllowance,
      netScore
    };
  });

  return {
    event,
    netRows: sharedPlacings(rows),
    grossRows: rankGrossLeaderboard(rows)
  };
}
