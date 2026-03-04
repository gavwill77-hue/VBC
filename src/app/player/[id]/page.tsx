import { notFound } from "next/navigation";
import { PlayerScorecardView } from "@/components/player-scorecard-view";
import { prisma } from "@/lib/db";
import { adjustedStrokesForInput, calculateCallawayResult } from "@/lib/callaway";

export default async function PublicPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      event: true,
      rounds: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          scores: {
            orderBy: { holeNumber: "asc" }
          }
        }
      }
    }
  });

  if (!player) {
    notFound();
  }

  const latestRound = player.rounds[0] ?? null;
  const callaway = latestRound?.roundNumber === 1
    ? calculateCallawayResult(
        latestRound.scores.map((score) => ({
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

  return (
    <PlayerScorecardView
      tournamentName={player.event.name}
      playerName={player.name}
      roundNumber={(latestRound?.roundNumber as 1 | 2) ?? 1}
      scores={latestRound?.scores ?? []}
      callaway={callaway ? {
        adjustedGross: callaway.adjustedGross,
        handicapAllowance: callaway.handicapAllowance,
        netScore: callaway.netScore
      } : null}
    />
  );
}
