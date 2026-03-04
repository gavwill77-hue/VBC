import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const event = await prisma.event.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" }
  });

  if (!event) {
    return NextResponse.json({ error: "No active event" }, { status: 404 });
  }

  return NextResponse.json({
    id: event.id,
    name: event.name,
    eventDate: event.eventDate,
    settings: {
      totalRounds: event.totalRounds,
      activeRoundNumber: event.activeRoundNumber,
      roundStartHole: event.roundStartHole,
      maxDoubleParEnabled: event.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: event.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: event.excludeWorseThanDoubleBogey,
      ambroseRequiredDrivesPerPlayer: event.ambroseRequiredDrivesPerPlayer,
      maxInputStrokes: event.maxInputStrokes,
      callawayTableVersion: event.callawayTableVersion
    }
  });
}
