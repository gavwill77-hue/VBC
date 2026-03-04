import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  playerId: z.string().min(1),
  action: z.enum(["reset", "unlock", "complete"])
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
    include: { event: true, rounds: true }
  });

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  let round = player.rounds.find((candidate) => candidate.roundNumber === player.event.activeRoundNumber);

  if (!round) {
    round = await prisma.round.create({
      data: {
        playerId: player.id,
        roundNumber: player.event.activeRoundNumber,
        startHole: player.event.roundStartHole,
        status: "IN_PROGRESS"
      }
    });
  }

  if (parsed.data.action === "reset") {
    await prisma.holeScore.deleteMany({ where: { roundId: round.id } });
    await prisma.round.update({
      where: { id: round.id },
      data: {
        status: "IN_PROGRESS",
        lockedByAdmin: false,
        adjustedGross: null,
        grossTotal: null,
        handicapAllowance: null,
        netScore: null,
        entitlement: null,
        adjustmentFactor: null,
        calcInputsJson: null
      }
    });
  }

  if (parsed.data.action === "unlock") {
    await prisma.round.update({ where: { id: round.id }, data: { lockedByAdmin: false, status: "IN_PROGRESS" } });
  }

  if (parsed.data.action === "complete") {
    await prisma.round.update({ where: { id: round.id }, data: { status: "COMPLETE", lockedByAdmin: true } });
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: `ADMIN_ROUND_${parsed.data.action.toUpperCase()}`,
      targetId: round.id,
      payloadJson: JSON.stringify(parsed.data)
    }
  });

  return NextResponse.json({ ok: true });
}
