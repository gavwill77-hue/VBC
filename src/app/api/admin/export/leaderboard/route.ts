import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { activeEvent } from "@/lib/server";
import { buildLeaderboard } from "@/lib/leaderboard";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const event = await activeEvent();
  const board = await buildLeaderboard(event.id);
  if (!board) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  const csv = toCsv(
    board.netRows.map((row) => ({
      place: row.place,
      player: row.playerName,
      holesCompleted: row.holesCompleted,
      frontNine: row.frontNine,
      backNine: row.backNine,
      grossTotal: row.grossTotal,
      adjustedGross: row.adjustedGross,
      handicapAllowance: row.handicapAllowance,
      netScore: row.netScore
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="leaderboard-${event.name}.csv"`
    }
  });
}
