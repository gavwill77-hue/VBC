import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  playerId: z.string().min(1),
  roundNumber: z.union([z.literal(1), z.literal(2)]),
  groupNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.null()])
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const player = await prisma.player.findUnique({
    where: { id: parsed.data.playerId },
    include: { event: true }
  });
  if (!player || !player.event.isActive) {
    return NextResponse.json({ error: "Player not found in active event" }, { status: 404 });
  }

  if (parsed.data.groupNumber === null) {
    await prisma.roundGroupAssignment.deleteMany({
      where: {
        eventId: player.eventId,
        roundNumber: parsed.data.roundNumber,
        playerId: player.id
      }
    });
  } else {
    await prisma.roundGroupAssignment.upsert({
      where: {
        eventId_roundNumber_playerId: {
          eventId: player.eventId,
          roundNumber: parsed.data.roundNumber,
          playerId: player.id
        }
      },
      update: { groupNumber: parsed.data.groupNumber },
      create: {
        eventId: player.eventId,
        roundNumber: parsed.data.roundNumber,
        groupNumber: parsed.data.groupNumber,
        playerId: player.id
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "ADMIN_UPDATE_ROUND_GROUP",
      targetId: player.id,
      payloadJson: JSON.stringify(parsed.data)
    }
  });

  return NextResponse.json({ ok: true });
}
