import { redirect } from "next/navigation";
import { adjustedStrokesForInput, calculateCallawayResult } from "@/lib/callaway";
import { ambroseHandicapForGroup, getPlayerAmbroseGroup } from "@/lib/ambrose";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server";
import { ScorecardClient } from "@/components/scorecard-client";

export default async function ScorecardPage() {
  const user = await requireUser();
  if (user.role !== "PLAYER") {
    redirect("/admin");
  }

  const player = await prisma.player.findFirst({
    where: { userId: user.id, event: { isActive: true } },
    include: {
      event: true,
      rounds: { include: { scores: true } }
    }
  });

  if (!player) {
    return <p>Player profile missing.</p>;
  }

  let round = player.rounds.find((candidate) => candidate.roundNumber === player.event.activeRoundNumber);
  if (!round) {
    round = await prisma.round.create({
      data: {
        playerId: player.id,
        roundNumber: player.event.activeRoundNumber,
        startHole: player.event.roundStartHole,
        status: "IN_PROGRESS"
      },
      include: { scores: true }
    });
  }

  const callaway = calculateCallawayResult(
    round.scores.map((score) => ({
      holeNumber: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, player.event.maxDoubleParEnabled)
    })),
    {
      maxDoubleParEnabled: player.event.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: player.event.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: player.event.excludeWorseThanDoubleBogey
    }
  );

  let ambrose: null | {
    groupNumber: number;
    teammates: string[];
    handicap: number;
    grossTotal: number;
    netScore: number;
  } = null;

  if (player.event.activeRoundNumber === 2) {
    const membership = await getPlayerAmbroseGroup(player.id);
    if (membership) {
      const handicap = await ambroseHandicapForGroup(membership.groupId);
      const grossTotal = round.scores.reduce((sum, score) => sum + score.strokesRaw, 0);
      ambrose = {
        groupNumber: membership.group.groupNumber,
        teammates: membership.group.members.map((member) => member.player.name),
        handicap,
        grossTotal,
        netScore: grossTotal - handicap
      };
    }
  }

  return (
    <ScorecardClient
      initialData={{
        player: { id: player.id, name: player.name },
        event: {
          name: player.event.name,
          activeRoundNumber: player.event.activeRoundNumber as 1 | 2,
          totalRounds: player.event.totalRounds,
          maxInputStrokes: player.event.maxInputStrokes,
          maxDoubleParEnabled: player.event.maxDoubleParEnabled,
          capDeductionPerHoleDoublePar: player.event.capDeductionPerHoleDoublePar,
          excludeWorseThanDoubleBogey: player.event.excludeWorseThanDoubleBogey
        },
        round: {
          id: round.id,
          startHole: round.startHole as 1 | 10,
          roundNumber: round.roundNumber as 1 | 2,
          status: round.status,
          lockedByAdmin: round.lockedByAdmin,
          scores: round.scores,
          callaway,
          ambrose
        }
      }}
    />
  );
}
