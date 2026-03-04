import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  name: z.string().min(1).max(80),
  eventDate: z.string().date(),
  roundStartHole: z.union([z.literal(1), z.literal(10)]),
  activeRoundNumber: z.union([z.literal(1), z.literal(2)]),
  maxDoubleParEnabled: z.boolean(),
  capDeductionPerHoleDoublePar: z.boolean(),
  excludeWorseThanDoubleBogey: z.boolean(),
  maxInputStrokes: z.number().int().min(10).max(30)
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

  const existing = await prisma.event.findFirst({ where: { isActive: true } });
  if (existing) {
    await prisma.event.update({ where: { id: existing.id }, data: { isActive: false } });
  }

  const event = await prisma.event.create({
    data: {
      name: parsed.data.name,
      eventDate: new Date(parsed.data.eventDate),
      isActive: true,
      totalRounds: 2,
      activeRoundNumber: parsed.data.activeRoundNumber,
      roundStartHole: parsed.data.roundStartHole,
      maxDoubleParEnabled: parsed.data.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: parsed.data.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: parsed.data.excludeWorseThanDoubleBogey,
      maxInputStrokes: parsed.data.maxInputStrokes,
      callawayTableVersion: "par72_liveabout_v1"
    }
  });

  if (existing) {
    const existingPlayers = await prisma.player.findMany({
      where: { eventId: existing.id },
      orderBy: { order: "asc" }
    });

    if (existingPlayers.length > 0) {
      await prisma.player.createMany({
        data: existingPlayers.map((player) => ({
          eventId: event.id,
          userId: player.userId,
          name: player.name,
          order: player.order
        }))
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "ADMIN_CREATE_EVENT",
      targetId: event.id,
      payloadJson: JSON.stringify(parsed.data)
    }
  });

  return NextResponse.json({ ok: true, eventId: event.id });
}
