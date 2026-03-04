import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hashSecret } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { playerPinSchema } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const players = await prisma.player.findMany({
    where: { event: { isActive: true } },
    include: { user: true },
    orderBy: { order: "asc" }
  });

  return NextResponse.json({
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      order: player.order,
      username: player.user.username
    }))
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = playerPinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid player payload" }, { status: 400 });
  }

  const player = await prisma.player.findUnique({ where: { id: parsed.data.playerId }, include: { user: true } });
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: player.userId },
        data: {
          username: parsed.data.username,
          passwordHash: hashSecret(parsed.data.pin)
        }
      }),
      prisma.player.update({
        where: { id: player.id },
        data: { name: parsed.data.name }
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "ADMIN_UPDATE_PLAYER_LOGIN",
          targetId: player.id,
          payloadJson: JSON.stringify({
            name: parsed.data.name,
            username: parsed.data.username
          })
        }
      })
    ]);
  } catch {
    return NextResponse.json({ error: "Username already in use or invalid update" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, username: parsed.data.username });
}
