import { COURSE_PAR, HOLE_MAP } from "@/lib/course";

export type Entitlement = number;

export type CallawayTableRow = {
  from: number;
  to: number;
  entitlement: Entitlement;
  adjustment: number;
  special?: "MAX_50";
};

const ADJUSTMENTS = [-2, -1, 0, 1, 2] as const;

function buildRangeRows(from: number, to: number, entitlement: number): CallawayTableRow[] {
  const rows: CallawayTableRow[] = [];
  let score = from;
  let adjustmentIndex = 0;

  while (score <= to) {
    rows.push({
      from: score,
      to: score,
      entitlement,
      adjustment: ADJUSTMENTS[adjustmentIndex]
    });
    score += 1;
    adjustmentIndex = (adjustmentIndex + 1) % ADJUSTMENTS.length;
  }

  return rows;
}

export const CALLAWAY_TABLE_VERSION = "par72_liveabout_v1";

export const CALLAWAY_PAR72_TABLE: CallawayTableRow[] = [
  { from: 0, to: 72, entitlement: 0, adjustment: 0 },
  ...buildRangeRows(73, 75, 0.5),
  ...buildRangeRows(76, 80, 1),
  ...buildRangeRows(81, 85, 1.5),
  ...buildRangeRows(86, 90, 2),
  ...buildRangeRows(91, 95, 2.5),
  ...buildRangeRows(96, 100, 3),
  ...buildRangeRows(101, 105, 3.5),
  ...buildRangeRows(106, 110, 4),
  ...buildRangeRows(111, 115, 4.5),
  ...buildRangeRows(116, 120, 5),
  ...buildRangeRows(121, 125, 5.5),
  ...buildRangeRows(126, 130, 6),
  { from: 131, to: Number.MAX_SAFE_INTEGER, entitlement: 0, adjustment: 0, special: "MAX_50" }
];

export type HoleScoreInput = {
  holeNumber: number;
  rawStrokes: number;
  adjustedStrokes: number;
};

export type CallawaySettings = {
  maxDoubleParEnabled: boolean;
  capDeductionPerHoleDoublePar: boolean;
  excludeWorseThanDoubleBogey: boolean;
};

export type CallawayResult = {
  grossTotal: number;
  adjustedGross: number;
  entitlement: number;
  adjustment: number;
  deductibleSum: number;
  handicapAllowance: number;
  netScore: number;
  selectedHoleNumbers: number[];
  halfHoleAppliedTo?: number;
  tableVersion: string;
  isMaxHandicapApplied: boolean;
};

function lookupRow(adjustedGross: number): CallawayTableRow {
  const row = CALLAWAY_PAR72_TABLE.find((candidate) => adjustedGross >= candidate.from && adjustedGross <= candidate.to);
  if (!row) {
    throw new Error(`No Callaway row for adjusted gross ${adjustedGross}`);
  }
  return row;
}

export function calculateCallawayResult(scores: HoleScoreInput[], settings: CallawaySettings): CallawayResult {
  if (scores.length === 0) {
    return {
      grossTotal: 0,
      adjustedGross: 0,
      entitlement: 0,
      adjustment: 0,
      deductibleSum: 0,
      handicapAllowance: 0,
      netScore: 0,
      selectedHoleNumbers: [],
      tableVersion: CALLAWAY_TABLE_VERSION,
      isMaxHandicapApplied: false
    };
  }

  const grossTotal = scores.reduce((sum, score) => sum + score.rawStrokes, 0);
  const adjustedGross = scores.reduce((sum, score) => sum + score.adjustedStrokes, 0);
  const row = lookupRow(adjustedGross);

  if (row.special === "MAX_50") {
    const handicapAllowance = 50;
    return {
      grossTotal,
      adjustedGross,
      entitlement: row.entitlement,
      adjustment: row.adjustment,
      deductibleSum: 0,
      handicapAllowance,
      netScore: adjustedGross - handicapAllowance,
      selectedHoleNumbers: [],
      tableVersion: CALLAWAY_TABLE_VERSION,
      isMaxHandicapApplied: true
    };
  }

  const deductionEligible = settings.excludeWorseThanDoubleBogey
    ? scores.filter((score) => {
        const holeMeta = HOLE_MAP.get(score.holeNumber);
        return holeMeta ? score.adjustedStrokes <= holeMeta.par * 2 : true;
      })
    : scores;

  const sortedWorst = [...deductionEligible].sort((a, b) => b.adjustedStrokes - a.adjustedStrokes || b.holeNumber - a.holeNumber);

  const fullHoleCount = Math.floor(row.entitlement);
  const hasHalf = row.entitlement % 1 === 0.5;
  const selected = sortedWorst.slice(0, fullHoleCount);

  let deductibleSum = 0;

  for (const hole of selected) {
    const holeMeta = HOLE_MAP.get(hole.holeNumber);
    if (!holeMeta) {
      continue;
    }
    const capped = settings.capDeductionPerHoleDoublePar ? Math.min(hole.adjustedStrokes, holeMeta.par * 2) : hole.adjustedStrokes;
    deductibleSum += capped;
  }

  let halfHoleAppliedTo: number | undefined;
  if (hasHalf) {
    const halfCandidate = sortedWorst[fullHoleCount];
    if (halfCandidate) {
      const holeMeta = HOLE_MAP.get(halfCandidate.holeNumber);
      if (holeMeta) {
        const capped = settings.capDeductionPerHoleDoublePar
          ? Math.min(halfCandidate.adjustedStrokes, holeMeta.par * 2)
          : halfCandidate.adjustedStrokes;
        deductibleSum += Math.ceil(capped / 2);
        halfHoleAppliedTo = halfCandidate.holeNumber;
      }
    }
  }

  const handicapAllowance = Math.max(0, Math.min(50, deductibleSum + row.adjustment));

  return {
    grossTotal,
    adjustedGross,
    entitlement: row.entitlement,
    adjustment: row.adjustment,
    deductibleSum,
    handicapAllowance,
    netScore: adjustedGross - handicapAllowance,
    selectedHoleNumbers: selected.map((s) => s.holeNumber),
    halfHoleAppliedTo,
    tableVersion: CALLAWAY_TABLE_VERSION,
    isMaxHandicapApplied: false
  };
}

export type LeaderboardRow = {
  playerId: string;
  playerName: string;
  holesCompleted: number;
  frontNine: number;
  backNine: number;
  grossTotal: number;
  grossToPar: number | null;
  adjustedGross: number;
  handicapAllowance: number;
  netScore: number;
};

export function rankNetLeaderboard(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (a.netScore !== b.netScore) {
      return a.netScore - b.netScore;
    }
    if (a.adjustedGross !== b.adjustedGross) {
      return a.adjustedGross - b.adjustedGross;
    }
    return a.playerName.localeCompare(b.playerName, "en-AU");
  });
}

export function rankGrossLeaderboard(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (a.grossTotal !== b.grossTotal) {
      return a.grossTotal - b.grossTotal;
    }
    return a.playerName.localeCompare(b.playerName, "en-AU");
  });
}

export function sharedPlacings(rows: LeaderboardRow[]): Array<LeaderboardRow & { place: string }> {
  const ranked = rankNetLeaderboard(rows);
  let placeNum = 1;
  return ranked.map((row, idx) => {
    if (idx > 0) {
      const prev = ranked[idx - 1];
      const isTie = prev.netScore === row.netScore && prev.adjustedGross === row.adjustedGross;
      if (!isTie) {
        placeNum = idx + 1;
      }
    }
    const next = ranked[idx + 1];
    const prev = ranked[idx - 1];
    const tiedWithPrev = !!prev && prev.netScore === row.netScore && prev.adjustedGross === row.adjustedGross;
    const tiedWithNext = !!next && next.netScore === row.netScore && next.adjustedGross === row.adjustedGross;

    return {
      ...row,
      place: tiedWithPrev || tiedWithNext ? `T${placeNum}` : String(placeNum)
    };
  });
}

export function toFrontBackTotals(scores: HoleScoreInput[]): { frontNine: number; backNine: number } {
  const frontNine = scores.filter((s) => s.holeNumber <= 9).reduce((sum, s) => sum + s.adjustedStrokes, 0);
  const backNine = scores.filter((s) => s.holeNumber >= 10).reduce((sum, s) => sum + s.adjustedStrokes, 0);
  return { frontNine, backNine };
}

export function adjustedStrokesForInput(raw: number, holeNumber: number, maxDoubleParEnabled: boolean): number {
  if (!maxDoubleParEnabled) {
    return raw;
  }
  const hole = HOLE_MAP.get(holeNumber);
  if (!hole) {
    throw new Error(`Unknown hole ${holeNumber}`);
  }
  return Math.min(raw, hole.par * 2);
}

export const COURSE_PAR_72 = COURSE_PAR;
