import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { adjustedStrokesForInput, calculateCallawayResult } from "@/lib/callaway";
import { ambroseHandicapForGroup, getPlayerAmbroseGroup } from "@/lib/ambrose";
import { prisma } from "@/lib/db";

const scoreSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  strokes: z.number().int().min(1).max(50)
});

const payloadSchema = z.object({
  playerId: z.string().min(1),
  scores: z.array(scoreSchema).min(1)
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

  const player = await prisma.player.findUnique({
    where: { id: parsed.data.playerId },
    include: {
      event: true,
      rounds: {
        include: { scores: true }
      }
    }
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
        status: "IN_PROGRESS",
        startHole: player.event.roundStartHole
      },
      include: { scores: true }
    });
  }

  for (const score of parsed.data.scores) {
    if (score.strokes > player.event.maxInputStrokes) {
      return NextResponse.json({ error: `Max input strokes is ${player.event.maxInputStrokes}` }, { status: 400 });
    }
  }

  await prisma.$transaction(
    parsed.data.scores.map((score) =>
      prisma.holeScore.upsert({
        where: {
          roundId_holeNumber: {
            roundId: round.id,
            holeNumber: score.holeNumber
          }
        },
        update: {
          strokesRaw: score.strokes,
          strokesAdjusted: adjustedStrokesForInput(score.strokes, score.holeNumber, player.event.maxDoubleParEnabled)
        },
        create: {
          roundId: round.id,
          holeNumber: score.holeNumber,
          strokesRaw: score.strokes,
          strokesAdjusted: adjustedStrokesForInput(score.strokes, score.holeNumber, player.event.maxDoubleParEnabled)
        }
      })
    )
  );

  const freshRound = await prisma.round.findUniqueOrThrow({
    where: { id: round.id },
    include: { scores: true }
  });

  if (player.event.activeRoundNumber === 2) {
    const membership = await getPlayerAmbroseGroup(player.id);
    if (membership) {
      const teammatePlayerIds = membership.group.members.map((member) => member.playerId);
      const teammateRounds = await prisma.round.findMany({
        where: {
          playerId: { in: teammatePlayerIds },
          roundNumber: 2
        }
      });

      const roundByPlayer = new Map(teammateRounds.map((roundItem) => [roundItem.playerId, roundItem]));
      for (const teammateId of teammatePlayerIds) {
        if (!roundByPlayer.has(teammateId)) {
          const created = await prisma.round.create({
            data: {
              playerId: teammateId,
              roundNumber: 2,
              startHole: player.event.roundStartHole,
              status: "IN_PROGRESS"
            }
          });
          roundByPlayer.set(teammateId, created);
        }
      }

      const rounds = [...roundByPlayer.values()];
      for (const teammateRound of rounds) {
        if (teammateRound.id === freshRound.id) continue;
        await prisma.$transaction(
          parsed.data.scores.map((score) =>
            prisma.holeScore.upsert({
              where: {
                roundId_holeNumber: {
                  roundId: teammateRound.id,
                  holeNumber: score.holeNumber
                }
              },
              update: {
                strokesRaw: score.strokes,
                strokesAdjusted: adjustedStrokesForInput(score.strokes, score.holeNumber, player.event.maxDoubleParEnabled)
              },
              create: {
                roundId: teammateRound.id,
                holeNumber: score.holeNumber,
                strokesRaw: score.strokes,
                strokesAdjusted: adjustedStrokesForInput(score.strokes, score.holeNumber, player.event.maxDoubleParEnabled)
              }
            })
          )
        );
      }

      const refreshedPrimary = await prisma.round.findUniqueOrThrow({
        where: { id: round.id },
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

      await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "ADMIN_UPDATE_AMBROSE_GROUP_SCORES",
          targetId: round.id,
          payloadJson: JSON.stringify({
            playerId: player.id,
            groupNumber: membership.group.groupNumber,
            updates: parsed.data.scores
          })
        }
      });

      return NextResponse.json({ ok: true });
    }
  }

  const callaway = calculateCallawayResult(
    freshRound.scores.map((score) => ({
      holeNumber: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, player.event.maxDoubleParEnabled)
    })),
    {
      maxDoubleParEnabled: player.event.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: player.event.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: player.event.excludeWorseThanDoubleBogey
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
        source: "admin_score_edit",
        settings: {
          maxDoubleParEnabled: player.event.maxDoubleParEnabled,
          capDeductionPerHoleDoublePar: player.event.capDeductionPerHoleDoublePar,
          excludeWorseThanDoubleBogey: player.event.excludeWorseThanDoubleBogey
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

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "ADMIN_UPDATE_PLAYER_SCORES",
      targetId: round.id,
      payloadJson: JSON.stringify({
        playerId: player.id,
        updates: parsed.data.scores
      })
    }
  });

  return NextResponse.json({ ok: true });
}
