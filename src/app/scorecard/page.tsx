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

  const selectedRoundNumber = (player.event.activeRoundNumber as 1 | 2);
  let roundUnavailableReason: string | null = null;

  let round = player.rounds.find((candidate) => candidate.roundNumber === selectedRoundNumber);
  let ambrose: null | {
    groupNumber: number;
    teammates: string[];
    handicap: number;
    grossTotal: number;
    netScore: number;
    firstDriveOptions: Array<{ playerId: string; name: string }>;
  } = null;

  if (selectedRoundNumber === 2) {
    const membership = await getPlayerAmbroseGroup(player.id);
    if (!membership) {
      roundUnavailableReason = "Round 2 score entry opens after admin allocates Ambrose pairs.";
    } else {
      const handicap = await ambroseHandicapForGroup(membership.groupId);
      const grossTotal = round?.scores.reduce((sum, score) => sum + score.strokesRaw, 0) ?? 0;
      ambrose = {
        groupNumber: membership.group.groupNumber,
        teammates: membership.group.members.map((member) => member.player.name),
        handicap,
        grossTotal,
        netScore: grossTotal - handicap,
        firstDriveOptions: membership.group.members.map((member) => ({
          playerId: member.player.id,
          name: member.player.name
        }))
      };
    }
  }

  if (!roundUnavailableReason && !round) {
    round = await prisma.round.create({
      data: {
        playerId: player.id,
        roundNumber: selectedRoundNumber,
        startHole: player.event.roundStartHole,
        status: "IN_PROGRESS"
      },
      include: { scores: true }
    });
  }

  const callaway = round
    ? calculateCallawayResult(
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
      )
    : null;

  // Check if player is in an Ambrose group but NOT in a round group — use Ambrose group for side-by-side entry
  const roundGroup = await prisma.roundGroupAssignment.findUnique({
    where: {
      eventId_roundNumber_playerId: {
        eventId: player.eventId,
        roundNumber: selectedRoundNumber,
        playerId: player.id
      }
    }
  });

  let scorerGroup: { groupNumber: number | null; members: Array<{ playerId: string; name: string; groupNumber: number | null; scores: Array<{ holeNumber: number; strokesRaw: number; firstDrivePlayerId: string | null }> }> } | undefined = undefined;

  if (!roundGroup) {
    const ambroseMembership = await getPlayerAmbroseGroup(player.id);
    if (ambroseMembership) {
      const ambrosePlayerIds = ambroseMembership.group.members.map((m) => m.playerId);
      const ambrosePlayers = await prisma.player.findMany({
        where: { id: { in: ambrosePlayerIds } },
        include: {
          rounds: { where: { roundNumber: selectedRoundNumber }, include: { scores: true } }
        },
        orderBy: { order: "asc" }
      });
      scorerGroup = {
        groupNumber: ambroseMembership.group.groupNumber,
        members: ambrosePlayers.map((p) => ({
          playerId: p.id,
          name: p.name,
          groupNumber: ambroseMembership.group.groupNumber,
          scores: p.rounds[0]?.scores ?? []
        }))
      };
    }
  }

  return (
    <ScorecardClient
      initialData={{
        player: { id: player.id, name: player.name },
        targetPlayer: { id: player.id, name: player.name },
        event: {
          name: player.event.name,
          activeRoundNumber: player.event.activeRoundNumber as 1 | 2,
          totalRounds: player.event.totalRounds,
          maxInputStrokes: player.event.maxInputStrokes,
          maxDoubleParEnabled: player.event.maxDoubleParEnabled,
          capDeductionPerHoleDoublePar: player.event.capDeductionPerHoleDoublePar,
          excludeWorseThanDoubleBogey: player.event.excludeWorseThanDoubleBogey,
          ambroseRequiredDrivesPerPlayer: player.event.ambroseRequiredDrivesPerPlayer
        },
        selectedRoundNumber,
        roundUnavailableReason,
        round: round && callaway
          ? {
              id: round.id,
              startHole: round.startHole as 1 | 10,
              roundNumber: round.roundNumber as 1 | 2,
              status: round.status,
              lockedByAdmin: round.lockedByAdmin,
              scores: round.scores,
              callaway,
              ambrose,
              ambroseGroupsInRoundGroup: null,
              scorerGroup
            }
          : null
      }}
    />
  );
}
