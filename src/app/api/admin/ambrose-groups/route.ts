import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const assignmentSchema = z.object({
  playerId: z.string().min(1),
  groupNumber: z.number().int().min(1).max(8)
});

const payloadSchema = z.object({
  assignments: z.array(assignmentSchema)
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = await prisma.event.findFirst({ where: { isActive: true } });
  if (!event) {
    return NextResponse.json({ error: "No active event" }, { status: 404 });
  }

  const players = await prisma.player.findMany({ where: { eventId: event.id } });
  const validPlayerIds = new Set(players.map((p) => p.id));
  for (const assignment of parsed.data.assignments) {
    if (!validPlayerIds.has(assignment.playerId)) {
      return NextResponse.json({ error: "Assignment includes invalid player" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.ambroseGroupMember.deleteMany({
      where: { group: { eventId: event.id } }
    });
    await tx.ambroseGroup.deleteMany({ where: { eventId: event.id } });

    const groupNumbers = [...new Set(parsed.data.assignments.map((a) => a.groupNumber))];
    const createdGroups = new Map<number, string>();

    for (const groupNumber of groupNumbers) {
      const group = await tx.ambroseGroup.create({
        data: {
          eventId: event.id,
          groupNumber
        }
      });
      createdGroups.set(groupNumber, group.id);
    }

    for (const assignment of parsed.data.assignments) {
      const groupId = createdGroups.get(assignment.groupNumber);
      if (!groupId) continue;
      await tx.ambroseGroupMember.create({
        data: {
          groupId,
          playerId: assignment.playerId
        }
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "ADMIN_SET_AMBROSE_GROUPS",
        targetId: event.id,
        payloadJson: JSON.stringify(parsed.data.assignments)
      }
    });
  });

  return NextResponse.json({ ok: true });
}
