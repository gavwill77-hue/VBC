import { adjustedStrokesForInput, calculateCallawayResult, rankNetLeaderboard, type HoleScoreInput, type LeaderboardRow } from "@/lib/callaway";
import { prisma } from "@/lib/db";

type RoundOnePosition = {
  playerId: string;
  position: number;
};

export async function roundOnePositions(eventId: string): Promise<RoundOnePosition[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      players: {
        include: { rounds: { where: { roundNumber: 1 }, include: { scores: true } } }
      }
    }
  });

  if (!event) return [];

  const rows: LeaderboardRow[] = event.players.map((player) => {
    const round = player.rounds[0];
    const scores: HoleScoreInput[] = (round?.scores ?? []).map((score) => ({
      holeNumber: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, event.maxDoubleParEnabled)
    }));

    const callaway = calculateCallawayResult(scores, {
      maxDoubleParEnabled: event.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: event.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: event.excludeWorseThanDoubleBogey
    });

    return {
      playerId: player.id,
      playerName: player.name,
      holesCompleted: scores.length,
      frontNine: 0,
      backNine: 0,
      grossTotal: callaway.grossTotal,
      grossToPar: null,
      adjustedGross: callaway.adjustedGross,
      handicapAllowance: callaway.handicapAllowance,
      netScore: callaway.netScore
    };
  });

  const ranked = rankNetLeaderboard(rows);
  let currentPosition = 1;

  return ranked.map((row, index) => {
    if (index > 0) {
      const prev = ranked[index - 1];
      if (prev.netScore !== row.netScore || prev.adjustedGross !== row.adjustedGross) {
        currentPosition = index + 1;
      }
    }
    return { playerId: row.playerId, position: currentPosition };
  });
}

export async function getPlayerAmbroseGroup(playerId: string) {
  return prisma.ambroseGroupMember.findUnique({
    where: { playerId },
    include: {
      group: {
        include: {
          members: {
            include: {
              player: true
            }
          },
          event: true
        }
      }
    }
  });
}

export async function ambroseHandicapForGroup(groupId: string): Promise<number> {
  const group = await prisma.ambroseGroup.findUnique({
    where: { id: groupId },
    include: {
      event: true,
      members: true
    }
  });

  if (!group) return 0;

  const positions = await roundOnePositions(group.eventId);
  const map = new Map(positions.map((entry) => [entry.playerId, entry.position]));

  return group.members.reduce((sum, member) => sum + (map.get(member.playerId) ?? 16), 0);
}
