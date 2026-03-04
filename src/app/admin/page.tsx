import { AdminPanel } from "@/components/admin-panel";
import { roundOnePositions } from "@/lib/ambrose";
import { requireAdmin } from "@/lib/server";
import { prisma } from "@/lib/db";

export default async function AdminPage() {
  await requireAdmin();

  const event = await prisma.event.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" }
  });

  if (!event) {
    return <p>No active event found.</p>;
  }

  const players = await prisma.player.findMany({
    where: { eventId: event.id },
    include: {
      user: true,
      ambroseMembership: {
        include: { group: { include: { members: { include: { player: true } } } } }
      },
      roundGroups: true,
      rounds: { include: { scores: true } }
    },
    orderBy: { order: "asc" }
  });

  const events = await prisma.event.findMany({
    orderBy: [{ isActive: "desc" }, { eventDate: "desc" }],
    select: {
      id: true,
      name: true,
      eventDate: true,
      isActive: true,
      activeRoundNumber: true,
      totalRounds: true
    }
  });

  const roundOnePositionMap = new Map((await roundOnePositions(event.id)).map((entry) => [entry.playerId, entry.position]));

  const mappedPlayers = players.map((player) => {
    const activeRound = player.rounds.find((round) => round.roundNumber === event.activeRoundNumber);
    return {
      id: player.id,
      name: player.name,
      username: player.user.username,
      order: player.order,
      latestRoundId: activeRound?.id,
      ambroseGroupNumber: player.ambroseMembership?.group.groupNumber ?? null,
      round1GroupNumber: player.roundGroups.find((item) => item.roundNumber === 1)?.groupNumber ?? null,
      round2GroupNumber: player.roundGroups.find((item) => item.roundNumber === 2)?.groupNumber ?? null,
      roundOnePosition: roundOnePositionMap.get(player.id) ?? null,
      scores: (activeRound?.scores ?? []).map((score) => ({
        holeNumber: score.holeNumber,
        strokesRaw: score.strokesRaw,
        firstDrivePlayerId: score.firstDrivePlayerId
      })),
      ambroseDriveOptions: player.ambroseMembership?.group.members.map((member) => ({
        playerId: member.player.id,
        name: member.player.name
      })) ?? []
    };
  });

  return (
    <AdminPanel
      event={{
        name: event.name,
        eventDate: event.eventDate.toISOString(),
        roundStartHole: event.roundStartHole as 1 | 10,
        activeRoundNumber: event.activeRoundNumber as 1 | 2,
        maxDoubleParEnabled: event.maxDoubleParEnabled,
        capDeductionPerHoleDoublePar: event.capDeductionPerHoleDoublePar,
        excludeWorseThanDoubleBogey: event.excludeWorseThanDoubleBogey,
        ambroseRequiredDrivesPerPlayer: event.ambroseRequiredDrivesPerPlayer,
        maxInputStrokes: event.maxInputStrokes
      }}
      events={events.map((item) => ({
        ...item,
        eventDate: item.eventDate.toISOString(),
        activeRoundNumber: item.activeRoundNumber as 1 | 2
      }))}
      players={mappedPlayers}
    />
  );
}
