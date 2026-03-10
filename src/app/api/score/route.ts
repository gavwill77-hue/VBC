import { NextRequest, NextResponse } from "next/server";
import { adjustedStrokesForInput, calculateCallawayResult } from "@/lib/callaway";
import { ambroseHandicapForGroup, getPlayerAmbroseGroup } from "@/lib/ambrose";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { quickEntrySchema, scoreEntrySchema } from "@/lib/validation";

type RoundNumber = 1 | 2;
type ScoreUpdate = {
  holeNumber: number;
  strokes?: number;
  firstDrivePlayerId?: string | null;
};
type AmbroseGroupContext = {
  groupNumber: number;
  representativePlayerId: string;
  memberNames: string[];
  scores: Array<{ holeNumber: number; strokesRaw: number; firstDrivePlayerId: string | null }>;
  handicap: number;
  grossTotal: number;
  netScore: number;
  firstDriveOptions: Array<{ playerId: string; name: string }>;
};

function sanitiseRoundNumber(input: unknown, fallback: number, totalRounds: number): RoundNumber {
  const parsed = Number(input);
  if ((parsed === 1 || parsed === 2) && parsed <= totalRounds) return parsed;
  return fallback === 2 ? 2 : 1;
}

async function applyUpdatesToRound(roundId: string, maxDoubleParEnabled: boolean, updates: ScoreUpdate[]) {
  for (const update of updates) {
    const existing = await prisma.holeScore.findUnique({
      where: {
        roundId_holeNumber: {
          roundId,
          holeNumber: update.holeNumber
        }
      }
    });

    if (!existing && update.strokes === undefined) {
      throw new Error(`Enter strokes for hole ${update.holeNumber} before assigning first drive.`);
    }

    const nextRaw = update.strokes ?? existing!.strokesRaw;
    const nextAdjusted = adjustedStrokesForInput(nextRaw, update.holeNumber, maxDoubleParEnabled);
    const nextFirstDrivePlayerId = update.firstDrivePlayerId !== undefined
      ? update.firstDrivePlayerId
      : (existing?.firstDrivePlayerId ?? null);

    if (existing) {
      await prisma.holeScore.update({
        where: { id: existing.id },
        data: {
          strokesRaw: nextRaw,
          strokesAdjusted: nextAdjusted,
          firstDrivePlayerId: nextFirstDrivePlayerId
        }
      });
    } else {
      await prisma.holeScore.create({
        data: {
          roundId,
          holeNumber: update.holeNumber,
          strokesRaw: nextRaw,
          strokesAdjusted: nextAdjusted,
          firstDrivePlayerId: nextFirstDrivePlayerId
        }
      });
    }
  }
}

async function getScoringContext(userId: string, requestedRound?: RoundNumber, requestedTargetPlayerId?: string) {
  const scorer = await prisma.player.findFirst({
    where: { userId, event: { isActive: true } },
    include: {
      event: true,
      rounds: { include: { scores: true } }
    }
  });
  if (!scorer) return null;

  const selectedRoundNumber = sanitiseRoundNumber(requestedRound, scorer.event.activeRoundNumber, scorer.event.totalRounds);

  const scorerRoundGroup = await prisma.roundGroupAssignment.findUnique({
    where: {
      eventId_roundNumber_playerId: {
        eventId: scorer.eventId,
        roundNumber: selectedRoundNumber,
        playerId: scorer.id
      }
    }
  });

  const groupAssignments = scorerRoundGroup
    ? await prisma.roundGroupAssignment.findMany({
        where: {
          eventId: scorer.eventId,
          roundNumber: selectedRoundNumber,
          groupNumber: scorerRoundGroup.groupNumber
        },
        include: {
          player: {
            include: {
              rounds: {
                where: { roundNumber: selectedRoundNumber },
                include: { scores: true }
              }
            }
          }
        },
        orderBy: { player: { order: "asc" } }
      })
    : [];

  let groupMembers = (groupAssignments.length > 0 ? groupAssignments : [{
    groupNumber: null,
    player: scorer
  } as unknown as (typeof groupAssignments)[number]]).map((entry) => ({
    playerId: entry.player.id,
    name: entry.player.name,
    groupNumber: scorerRoundGroup?.groupNumber ?? null,
    scores: entry.player.rounds[0]?.scores ?? []
  }));

  // Case A: No round group — use Ambrose group membership as authorization & display fallback
  const scorerAmbroseMembership = groupAssignments.length === 0
    ? await getPlayerAmbroseGroup(scorer.id)
    : null;

  if (scorerAmbroseMembership) {
    const ambrosePlayerIds = scorerAmbroseMembership.group.members.map((m) => m.playerId);
    const ambrosePlayers = await prisma.player.findMany({
      where: { id: { in: ambrosePlayerIds } },
      include: {
        rounds: { where: { roundNumber: selectedRoundNumber }, include: { scores: true } }
      },
      orderBy: { order: "asc" }
    });
    groupMembers = ambrosePlayers.map((p) => ({
      playerId: p.id,
      name: p.name,
      groupNumber: scorerAmbroseMembership.group.groupNumber,
      scores: p.rounds[0]?.scores ?? []
    }));
  }

  // Case B: Round group exists on Round 2 — detect all Ambrose groups within the round group
  let ambroseGroupsInRoundGroup: AmbroseGroupContext[] | null = null;

  if (groupAssignments.length > 0 && selectedRoundNumber === 2) {
    const memberIds = groupAssignments.map((a) => a.player.id);
    const memberships = await prisma.ambroseGroupMember.findMany({
      where: { playerId: { in: memberIds } },
      include: {
        group: { include: { members: { include: { player: true } } } }
      }
    });

    const seenGroups = new Map<string, (typeof memberships)[number]>();
    for (const m of memberships) {
      if (!seenGroups.has(m.groupId)) seenGroups.set(m.groupId, m);
    }

    if (seenGroups.size > 1) {
      ambroseGroupsInRoundGroup = [];
      for (const membership of seenGroups.values()) {
        const repPlayerId = membership.playerId;
        const repRound = await prisma.round.findFirst({
          where: { playerId: repPlayerId, roundNumber: 2 },
          include: { scores: true }
        });
        const handicap = await ambroseHandicapForGroup(membership.groupId);
        const grossTotal = repRound?.scores.reduce((s, sc) => s + sc.strokesRaw, 0) ?? 0;
        ambroseGroupsInRoundGroup.push({
          groupNumber: membership.group.groupNumber,
          representativePlayerId: repPlayerId,
          memberNames: membership.group.members.map((m) => m.player.name),
          scores: repRound?.scores ?? [],
          handicap,
          grossTotal,
          netScore: grossTotal - handicap,
          firstDriveOptions: membership.group.members.map((m) => ({ playerId: m.player.id, name: m.player.name }))
        });
      }
    }
  }

  const targetPlayerId = requestedTargetPlayerId ?? scorer.id;
  const targetAllowed = groupMembers.some((member) => member.playerId === targetPlayerId);
  if (!targetAllowed) {
    return {
      error: "Target player is not in your group",
      status: 403
    } as const;
  }

  const targetPlayer = await prisma.player.findUnique({
    where: { id: targetPlayerId },
    include: { rounds: { include: { scores: true } } }
  });
  if (!targetPlayer) {
    return { error: "Target player not found", status: 404 } as const;
  }

  let round = targetPlayer.rounds.find((candidate) => candidate.roundNumber === selectedRoundNumber);
  if (!round) {
    round = await prisma.round.create({
      data: {
        playerId: targetPlayer.id,
        roundNumber: selectedRoundNumber,
        status: "IN_PROGRESS",
        startHole: scorer.event.roundStartHole
      },
      include: { scores: true }
    });
  }

  let roundUnavailableReason: string | null = null;
  let ambrose: {
    groupNumber: number;
    teammates: string[];
    handicap: number;
    grossTotal: number;
    netScore: number;
    firstDriveOptions: Array<{ playerId: string; name: string }>;
  } | null = null;

  if (selectedRoundNumber === 2) {
    const membership = await getPlayerAmbroseGroup(targetPlayer.id);
    if (!membership) {
      roundUnavailableReason = "Round 2 score entry opens after admin allocates Ambrose pairs.";
    } else {
      const handicap = await ambroseHandicapForGroup(membership.groupId);
      const grossTotal = round.scores.reduce((sum, score) => sum + score.strokesRaw, 0);
      ambrose = {
        groupNumber: membership.group.groupNumber,
        teammates: membership.group.members.map((member) => member.player.name),
        handicap,
        grossTotal,
        netScore: grossTotal - handicap,
        firstDriveOptions: membership.group.members.map((member) => ({
          playerId: member.player.id,
          name: member.player.name
        }))
      };
    }
  }

  return {
    scorer,
    targetPlayer,
    round,
    selectedRoundNumber,
    roundUnavailableReason,
    ambrose,
    groupNumber: scorerRoundGroup?.groupNumber ?? scorerAmbroseMembership?.group.groupNumber ?? null,
    groupMembers,
    ambroseGroupsInRoundGroup
  } as const;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const requestedRound = request.nextUrl.searchParams.get("roundNumber");
  const requestedTargetPlayerId = request.nextUrl.searchParams.get("targetPlayerId") ?? undefined;
  const context = await getScoringContext(
    user.id,
    requestedRound === "2" ? 2 : requestedRound === "1" ? 1 : undefined,
    requestedTargetPlayerId
  );
  if (!context) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

  const callaway = calculateCallawayResult(
    context.round.scores.map((score) => ({
      holeNumber: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, context.scorer.event.maxDoubleParEnabled)
    })),
    {
      maxDoubleParEnabled: context.scorer.event.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: context.scorer.event.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: context.scorer.event.excludeWorseThanDoubleBogey
    }
  );

  return NextResponse.json({
    player: { id: context.scorer.id, name: context.scorer.name },
    targetPlayer: { id: context.targetPlayer.id, name: context.targetPlayer.name },
    event: context.scorer.event,
    selectedRoundNumber: context.selectedRoundNumber,
    roundUnavailableReason: context.roundUnavailableReason,
    round: {
      id: context.round.id,
      roundNumber: context.round.roundNumber,
      startHole: context.round.startHole,
      status: context.round.status,
      lockedByAdmin: context.round.lockedByAdmin,
      scores: context.round.scores,
      callaway,
      ambrose: context.round.roundNumber === 2 ? context.ambrose : null,
      ambroseGroupsInRoundGroup: context.ambroseGroupsInRoundGroup,
      scorerGroup: {
        groupNumber: context.groupNumber,
        members: context.groupMembers
      }
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
  if (mode === "quick" && parsedQuick?.success) roundNumber = parsedQuick.data.roundNumber;
  if (mode === "single" && parsedSingle?.success) roundNumber = parsedSingle.data.roundNumber;
  const targetPlayerId = typeof body?.targetPlayerId === "string" ? body.targetPlayerId : undefined;

  const context = await getScoringContext(user.id, roundNumber, targetPlayerId);
  if (!context) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.roundUnavailableReason) return NextResponse.json({ error: context.roundUnavailableReason }, { status: 409 });
  if (context.round.lockedByAdmin || context.round.status === "COMPLETE") {
    return NextResponse.json({ error: "Round is locked" }, { status: 409 });
  }

  let updates: ScoreUpdate[] = [];
  if (mode === "quick" && parsedQuick?.success) {
    updates = parsedQuick.data.scores.map((entry) => ({
      holeNumber: entry.holeNumber,
      strokes: entry.strokes,
      firstDrivePlayerId: entry.firstDrivePlayerId
    }));
  } else if (mode === "single" && parsedSingle?.success) {
    updates = [{
      holeNumber: parsedSingle.data.holeNumber,
      strokes: parsedSingle.data.strokes,
      firstDrivePlayerId: parsedSingle.data.firstDrivePlayerId
    }];
  }

  for (const update of updates) {
    if (update.strokes !== undefined && update.strokes > context.scorer.event.maxInputStrokes) {
      return NextResponse.json({ error: `Max input strokes is ${context.scorer.event.maxInputStrokes}` }, { status: 400 });
    }
  }

  if (context.selectedRoundNumber === 2 && context.ambrose) {
    const membership = await getPlayerAmbroseGroup(context.targetPlayer.id);
    if (!membership) return NextResponse.json({ error: "Round 2 requires Ambrose pair allocation" }, { status: 409 });

    const teammatePlayerIds = membership.group.members.map((member) => member.playerId);
    const allowedDriveIds = new Set(teammatePlayerIds);
    for (const update of updates) {
      if (update.firstDrivePlayerId !== undefined && update.firstDrivePlayerId !== null && !allowedDriveIds.has(update.firstDrivePlayerId)) {
        return NextResponse.json({ error: "First drive player must be from your Ambrose pair" }, { status: 400 });
      }
    }

    const existingTeammateRounds = await prisma.round.findMany({
      where: { playerId: { in: teammatePlayerIds }, roundNumber: 2 }
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
            startHole: context.scorer.event.roundStartHole,
            status: "IN_PROGRESS"
          }
        });
        roundByPlayer.set(teammateId, created);
      }
    }

    for (const round of [...roundByPlayer.values()]) {
      await applyUpdatesToRound(round.id, context.scorer.event.maxDoubleParEnabled, updates);
    }

    const primaryRound = await prisma.round.findUniqueOrThrow({
      where: { id: context.round.id },
      include: { scores: true }
    });
    const grossTotal = primaryRound.scores.reduce((sum, score) => sum + score.strokesRaw, 0);
    const handicap = await ambroseHandicapForGroup(membership.groupId);
    const netScore = grossTotal - handicap;

    await prisma.round.updateMany({
      where: { playerId: { in: teammatePlayerIds }, roundNumber: 2 },
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

    return NextResponse.json({ ok: true });
  }

  await applyUpdatesToRound(context.round.id, context.scorer.event.maxDoubleParEnabled, updates);

  const freshRound = await prisma.round.findUniqueOrThrow({
    where: { id: context.round.id },
    include: { scores: true }
  });
  const callaway = calculateCallawayResult(
    freshRound.scores.map((score) => ({
      holeNumber: score.holeNumber,
      rawStrokes: score.strokesRaw,
      adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, context.scorer.event.maxDoubleParEnabled)
    })),
    {
      maxDoubleParEnabled: context.scorer.event.maxDoubleParEnabled,
      capDeductionPerHoleDoublePar: context.scorer.event.capDeductionPerHoleDoublePar,
      excludeWorseThanDoubleBogey: context.scorer.event.excludeWorseThanDoubleBogey
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
          maxDoubleParEnabled: context.scorer.event.maxDoubleParEnabled,
          capDeductionPerHoleDoublePar: context.scorer.event.capDeductionPerHoleDoublePar,
          excludeWorseThanDoubleBogey: context.scorer.event.excludeWorseThanDoubleBogey
        },
        scores: freshRound.scores.map((score) => ({
          hole: score.holeNumber,
          raw: score.strokesRaw,
          adjusted: score.strokesAdjusted,
          firstDrivePlayerId: score.firstDrivePlayerId
        }))
      }),
      lastCalculatedAt: new Date()
    }
  });

  return NextResponse.json({ ok: true });
}
