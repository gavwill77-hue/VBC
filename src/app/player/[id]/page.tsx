import { notFound } from "next/navigation";
import { PlayerScorecardView } from "@/components/player-scorecard-view";
import { prisma } from "@/lib/db";

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

  return (
    <PlayerScorecardView
      tournamentName={player.event.name}
      playerName={player.name}
      scores={player.rounds[0]?.scores ?? []}
    />
  );
}
