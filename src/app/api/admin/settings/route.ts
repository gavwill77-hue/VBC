import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { adminSettingsSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }

  const event = await prisma.event.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  if (!event) {
    return NextResponse.json({ error: "No active event" }, { status: 404 });
  }

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: {
      name: parsed.data.eventName,
      eventDate: new Date(parsed.data.eventDate),
      roundStartHole: parsed.data.roundStartHole,
      activeRoundNumber: parsed.data.activeRoundNumber,
      maxDoubleParEnabled: parsed.data.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: parsed.data.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: parsed.data.excludeWorseThanDoubleBogey,
      ambroseRequiredDrivesPerPlayer: parsed.data.ambroseRequiredDrivesPerPlayer,
      maxInputStrokes: parsed.data.maxInputStrokes
    }
  });

  await prisma.round.updateMany({
    where: {
      player: {
        eventId: event.id
      }
    },
    data: {
      startHole: parsed.data.roundStartHole
    }
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "ADMIN_UPDATE_SETTINGS",
      targetId: updated.id,
      payloadJson: JSON.stringify(parsed.data)
    }
  });

  return NextResponse.json({ ok: true, event: updated });
}
