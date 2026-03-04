import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { id } = await params;

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { scores: { orderBy: { holeNumber: "asc" } } }
      }
    }
  });

  if (!player || !player.rounds[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const round = player.rounds[0];
  const csv = toCsv(
    round.scores.map((score) => ({
      hole: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: score.strokesAdjusted
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="scorecard-${player.name}.csv"`
    }
  });
}
