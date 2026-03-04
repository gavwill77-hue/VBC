import { NextRequest, NextResponse } from "next/server";
import { adjustedStrokesForInput, calculateCallawayResult } from "@/lib/callaway";
import { ambroseHandicapForGroup, getPlayerAmbroseGroup } from "@/lib/ambrose";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { quickEntrySchema, scoreEntrySchema } from "@/lib/validation";

async function getPlayerRound(userId: string) {
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

  let round = player.rounds.find((candidate) => candidate.roundNumber === player.event.activeRoundNumber);
  if (!round) {
    round = await prisma.round.create({
      data: {
        playerId: player.id,
        roundNumber: player.event.activeRoundNumber,
        status: "IN_PROGRESS",
        startHole: player.event.roundStartHole
      },
      include: { scores: true }
    });
  }

  return { player, round };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const data = await getPlayerRound(user.id);
  if (!data) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
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

  let ambrose: {
    groupNumber: number;
    teammates: string[];
    handicap: number;
    grossTotal: number;
    netScore: number;
  } | null = null;

  if (data.player.event.activeRoundNumber === 2) {
    const membership = await getPlayerAmbroseGroup(data.player.id);
    if (membership) {
      const handicap = await ambroseHandicapForGroup(membership.groupId);
      const grossTotal = data.round.scores.reduce((sum, score) => sum + score.strokesRaw, 0);
      ambrose = {
        groupNumber: membership.group.groupNumber,
        teammates: membership.group.members.map((member) => member.player.name),
        handicap,
        grossTotal,
        netScore: grossTotal - handicap
      };
    }
  }

  return NextResponse.json({
    player: { id: data.player.id, name: data.player.name },
    event: data.player.event,
    round: {
      id: data.round.id,
      roundNumber: data.round.roundNumber,
      startHole: data.round.startHole,
      status: data.round.status,
      lockedByAdmin: data.round.lockedByAdmin,
      scores: data.round.scores,
      callaway,
      ambrose
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

  const data = await getPlayerRound(user.id);
  if (!data) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  if (data.round.lockedByAdmin || data.round.status === "COMPLETE") {
    return NextResponse.json({ error: "Round is locked" }, { status: 409 });
  }

  const event = data.player.event;

  let updates: Array<{ holeNumber: number; strokes: number }> = [];
  if (mode === "quick" && parsedQuick?.success) {
    updates = parsedQuick.data.scores;
  } else if (mode === "single" && parsedSingle?.success) {
    updates = [parsedSingle.data];
  }

  for (const update of updates) {
    if (update.strokes > event.maxInputStrokes) {
      return NextResponse.json({ error: `Max input strokes is ${event.maxInputStrokes}` }, { status: 400 });
    }
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.holeScore.upsert({
        where: {
          roundId_holeNumber: {
            roundId: data.round.id,
            holeNumber: update.holeNumber
          }
        },
        update: {
          strokesRaw: update.strokes,
          strokesAdjusted: adjustedStrokesForInput(update.strokes, update.holeNumber, event.maxDoubleParEnabled)
        },
        create: {
          roundId: data.round.id,
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

  if (event.activeRoundNumber === 2) {
    const membership = await getPlayerAmbroseGroup(data.player.id);
    if (membership) {
      const teammatePlayerIds = membership.group.members.map((member) => member.playerId);
      const teammateRounds = await prisma.round.findMany({
        where: {
          playerId: { in: teammatePlayerIds },
          roundNumber: 2
        }
      });

      const roundByPlayer = new Map(teammateRounds.map((round) => [round.playerId, round]));
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
        if (round.id === freshRound.id) continue;
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

      const refreshedPrimary = await prisma.round.findUniqueOrThrow({
        where: { id: data.round.id },
        include: { scores: true }
      });
      const grossTotal = refreshedPrimary.scores.reduce((sum, score) => sum + score.strokesRaw, 0);
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
  }

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
