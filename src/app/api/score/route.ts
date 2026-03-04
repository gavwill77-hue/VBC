import { NextRequest, NextResponse } from "next/server";
import { adjustedStrokesForInput, calculateCallawayResult } from "@/lib/callaway";
import { ambroseHandicapForGroup, getPlayerAmbroseGroup } from "@/lib/ambrose";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { quickEntrySchema, scoreEntrySchema } from "@/lib/validation";

type RoundNumber = 1 | 2;

function sanitiseRoundNumber(input: unknown, fallback: number, totalRounds: number): RoundNumber {
  const parsed = Number(input);
  if ((parsed === 1 || parsed === 2) && parsed <= totalRounds) {
    return parsed;
  }
  return fallback === 2 ? 2 : 1;
}

async function getPlayerRound(userId: string, requestedRound?: RoundNumber) {
  const player = await prisma.player.findFirst({
    where: { userId, event: { isActive: true } },
    include: {
      event: true,
      rounds: { include: { scores: true } }
    }
  });

  if (!player) {
    return null;
  }

  const selectedRoundNumber = sanitiseRoundNumber(
    requestedRound,
    player.event.activeRoundNumber,
    player.event.totalRounds
  );

  let roundUnavailableReason: string | null = null;
  let ambrose: {
    groupNumber: number;
    teammates: string[];
    handicap: number;
    grossTotal: number;
    netScore: number;
  } | null = null;

  if (selectedRoundNumber === 2) {
    const membership = await getPlayerAmbroseGroup(player.id);
    if (!membership) {
      roundUnavailableReason = "Round 2 score entry opens after admin allocates Ambrose pairs.";
      return { player, round: null, selectedRoundNumber, roundUnavailableReason, ambrose };
    }
    const handicap = await ambroseHandicapForGroup(membership.groupId);
    const existingRound = player.rounds.find((candidate) => candidate.roundNumber === 2);
    const grossTotal = existingRound?.scores.reduce((sum, score) => sum + score.strokesRaw, 0) ?? 0;
    ambrose = {
      groupNumber: membership.group.groupNumber,
      teammates: membership.group.members.map((member) => member.player.name),
      handicap,
      grossTotal,
      netScore: grossTotal - handicap
    };
  }

  let round = player.rounds.find((candidate) => candidate.roundNumber === selectedRoundNumber);
  if (!round) {
    round = await prisma.round.create({
      data: {
        playerId: player.id,
        roundNumber: selectedRoundNumber,
        status: "IN_PROGRESS",
        startHole: player.event.roundStartHole
      },
      include: { scores: true }
    });
  }

  if (selectedRoundNumber === 2 && ambrose) {
    const grossTotal = round.scores.reduce((sum, score) => sum + score.strokesRaw, 0);
    ambrose = {
      ...ambrose,
      grossTotal,
      netScore: grossTotal - ambrose.handicap
    };
  }

  return { player, round, selectedRoundNumber, roundUnavailableReason, ambrose };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const requestedRound = request.nextUrl.searchParams.get("roundNumber");
  const data = await getPlayerRound(user.id, requestedRound === "2" ? 2 : requestedRound === "1" ? 1 : undefined);
  if (!data) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  if (!data.round) {
    return NextResponse.json({
      player: { id: data.player.id, name: data.player.name },
      event: data.player.event,
      selectedRoundNumber: data.selectedRoundNumber,
      roundUnavailableReason: data.roundUnavailableReason,
      round: null
    });
  }

  const callaway = calculateCallawayResult(
    data.round.scores.map((score) => ({
      holeNumber: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, data.player.event.maxDoubleParEnabled)
    })),
    {
      maxDoubleParEnabled: data.player.event.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: data.player.event.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: data.player.event.excludeWorseThanDoubleBogey
    }
  );

  return NextResponse.json({
    player: { id: data.player.id, name: data.player.name },
    event: data.player.event,
    selectedRoundNumber: data.selectedRoundNumber,
    roundUnavailableReason: data.roundUnavailableReason,
    round: {
      id: data.round.id,
      roundNumber: data.round.roundNumber,
      startHole: data.round.startHole,
      status: data.round.status,
      lockedByAdmin: data.round.lockedByAdmin,
      scores: data.round.scores,
      callaway,
      ambrose: data.round.roundNumber === 2 ? data.ambrose : null
    }
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const mode = body?.mode === "quick" ? "quick" : "single";
  const parsedQuick = mode === "quick" ? quickEntrySchema.safeParse(body) : null;
  const parsedSingle = mode === "single" ? scoreEntrySchema.safeParse(body) : null;

  if ((mode === "quick" && !parsedQuick?.success) || (mode === "single" && !parsedSingle?.success)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let roundNumber: RoundNumber | undefined;
  if (mode === "quick" && parsedQuick?.success) {
    roundNumber = parsedQuick.data.roundNumber;
  }
  if (mode === "single" && parsedSingle?.success) {
    roundNumber = parsedSingle.data.roundNumber;
  }
  const data = await getPlayerRound(user.id, roundNumber);
  if (!data) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if (!data.round) {
    return NextResponse.json({ error: data.roundUnavailableReason ?? "Round unavailable" }, { status: 409 });
  }
  if (data.round.lockedByAdmin || data.round.status === "COMPLETE") {
    return NextResponse.json({ error: "Round is locked" }, { status: 409 });
  }

  const event = data.player.event;
  let updates: Array<{ holeNumber: number; strokes: number }> = [];
  if (mode === "quick" && parsedQuick?.success) {
    updates = parsedQuick.data.scores;
  } else if (mode === "single" && parsedSingle?.success) {
    updates = [{ holeNumber: parsedSingle.data.holeNumber, strokes: parsedSingle.data.strokes }];
  }

  for (const update of updates) {
    if (update.strokes > event.maxInputStrokes) {
      return NextResponse.json({ error: `Max input strokes is ${event.maxInputStrokes}` }, { status: 400 });
    }
  }

  if (data.selectedRoundNumber === 2) {
    const membership = await getPlayerAmbroseGroup(data.player.id);
    if (!membership) {
      return NextResponse.json({ error: "Round 2 requires Ambrose pair allocation" }, { status: 409 });
    }

    const teammatePlayerIds = membership.group.members.map((member) => member.playerId);
    const existingTeammateRounds = await prisma.round.findMany({
      where: {
        playerId: { in: teammatePlayerIds },
        roundNumber: 2
      }
    });

    if (existingTeammateRounds.some((round) => round.lockedByAdmin || round.status === "COMPLETE")) {
      return NextResponse.json({ error: "Round 2 is locked for this Ambrose group" }, { status: 409 });
    }

    const roundByPlayer = new Map(existingTeammateRounds.map((round) => [round.playerId, round]));
    for (const teammateId of teammatePlayerIds) {
      if (!roundByPlayer.has(teammateId)) {
        const created = await prisma.round.create({
          data: {
            playerId: teammateId,
            roundNumber: 2,
            startHole: event.roundStartHole,
            status: "IN_PROGRESS"
          }
        });
        roundByPlayer.set(teammateId, created);
      }
    }

    const rounds = [...roundByPlayer.values()];
    for (const round of rounds) {
      await prisma.$transaction(
        updates.map((update) =>
          prisma.holeScore.upsert({
            where: {
              roundId_holeNumber: {
                roundId: round.id,
                holeNumber: update.holeNumber
              }
            },
            update: {
              strokesRaw: update.strokes,
              strokesAdjusted: adjustedStrokesForInput(update.strokes, update.holeNumber, event.maxDoubleParEnabled)
            },
            create: {
              roundId: round.id,
              holeNumber: update.holeNumber,
              strokesRaw: update.strokes,
              strokesAdjusted: adjustedStrokesForInput(update.strokes, update.holeNumber, event.maxDoubleParEnabled)
            }
          })
        )
      );
    }

    const primaryRound = await prisma.round.findUniqueOrThrow({
      where: { id: data.round.id },
      include: { scores: true }
    });
    const grossTotal = primaryRound.scores.reduce((sum, score) => sum + score.strokesRaw, 0);
    const handicap = await ambroseHandicapForGroup(membership.groupId);
    const netScore = grossTotal - handicap;

    await prisma.round.updateMany({
      where: {
        playerId: { in: teammatePlayerIds },
        roundNumber: 2
      },
      data: {
        grossTotal,
        adjustedGross: grossTotal,
        handicapAllowance: handicap,
        netScore,
        entitlement: "AMBROSE_GROUP_HANDICAP",
        adjustmentFactor: 0,
        calcInputsJson: JSON.stringify({
          format: "AMBROSE",
          groupNumber: membership.group.groupNumber,
          handicap
        }),
        lastCalculatedAt: new Date()
      }
    });

    return NextResponse.json({
      ok: true,
      ambrose: {
        groupNumber: membership.group.groupNumber,
        handicap,
        grossTotal,
        netScore
      }
    });
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.holeScore.upsert({
        where: {
          roundId_holeNumber: {
            roundId: data.round!.id,
            holeNumber: update.holeNumber
          }
        },
        update: {
          strokesRaw: update.strokes,
          strokesAdjusted: adjustedStrokesForInput(update.strokes, update.holeNumber, event.maxDoubleParEnabled)
        },
        create: {
          roundId: data.round!.id,
          holeNumber: update.holeNumber,
          strokesRaw: update.strokes,
          strokesAdjusted: adjustedStrokesForInput(update.strokes, update.holeNumber, event.maxDoubleParEnabled)
        }
      })
    )
  );

  const freshRound = await prisma.round.findUniqueOrThrow({
    where: { id: data.round.id },
    include: { scores: true }
  });

  const callaway = calculateCallawayResult(
    freshRound.scores.map((score) => ({
      holeNumber: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, event.maxDoubleParEnabled)
    })),
    {
      maxDoubleParEnabled: event.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: event.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: event.excludeWorseThanDoubleBogey
    }
  );

  await prisma.round.update({
    where: { id: freshRound.id },
    data: {
      grossTotal: callaway.grossTotal,
      adjustedGross: callaway.adjustedGross,
      handicapAllowance: callaway.handicapAllowance,
      netScore: callaway.netScore,
      entitlement: String(callaway.entitlement),
      adjustmentFactor: callaway.adjustment,
      calcInputsJson: JSON.stringify({
        settings: {
          maxDoubleParEnabled: event.maxDoubleParEnabled,
          capDeductionPerHoleDoublePar: event.capDeductionPerHoleDoublePar,
          excludeWorseThanDoubleBogey: event.excludeWorseThanDoubleBogey
        },
        scores: freshRound.scores.map((score) => ({
          hole: score.holeNumber,
          raw: score.strokesRaw,
          adjusted: score.strokesAdjusted
        }))
      }),
      lastCalculatedAt: new Date()
    }
  });

  return NextResponse.json({ ok: true, callaway });
}
