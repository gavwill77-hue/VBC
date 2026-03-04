import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const activateSchema = z.object({
  eventId: z.string().min(1)
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

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

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = activateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id: parsed.data.eventId } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.event.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    prisma.event.update({ where: { id: event.id }, data: { isActive: true } }),
    prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "ADMIN_ACTIVATE_EVENT",
        targetId: event.id,
        payloadJson: JSON.stringify({ eventId: event.id })
      }
    })
  ]);

  return NextResponse.json({ ok: true });
}
