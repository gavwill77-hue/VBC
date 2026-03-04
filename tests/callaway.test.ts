import { describe, expect, it } from "vitest";
import { calculateCallawayResult, sharedPlacings, adjustedStrokesForInput, type HoleScoreInput } from "../src/lib/callaway";
import { HOLES } from "../src/lib/course";

function fromRaw(rawByHole: number[]): HoleScoreInput[] {
  return rawByHole.map((raw, index) => ({
    holeNumber: index + 1,
    rawStrokes: raw,
    adjustedStrokes: raw
  }));
}

function scoresForAdjustedGross(targetAdjustedGross: number): HoleScoreInput[] {
  const base = HOLES.map((hole) => ({
    holeNumber: hole.hole,
    rawStrokes: hole.par,
    adjustedStrokes: hole.par
  }));
  const baseTotal = base.reduce((sum, score) => sum + score.rawStrokes, 0);
  const delta = targetAdjustedGross - baseTotal;
  if (delta < 0) {
    throw new Error("Target adjusted gross must be >= 72");
  }
  base[0].rawStrokes += delta;
  base[0].adjustedStrokes += delta;
  return base;
}

function expectedEntitlement(score: number): number {
  if (score <= 72) return 0;
  if (score <= 75) return 0.5;
  if (score <= 80) return 1;
  if (score <= 85) return 1.5;
  if (score <= 90) return 2;
  if (score <= 95) return 2.5;
  if (score <= 100) return 3;
  if (score <= 105) return 3.5;
  if (score <= 110) return 4;
  if (score <= 115) return 4.5;
  if (score <= 120) return 5;
  if (score <= 125) return 5.5;
  if (score <= 130) return 6;
  return 0;
}

function expectedAdjustment(score: number): number {
  if (score <= 72) return 0;
  if (score >= 131) return 0;
  const cycle = [-2, -1, 0, 1, 2];
  if (score <= 75) {
    return cycle[score - 73];
  }
  const groupStart = 76 + Math.floor((score - 76) / 5) * 5;
  return cycle[score - groupStart];
}

describe("Callaway calculation", () => {
  it("applies max double par when enabled", () => {
    const raw = Array.from({ length: 18 }, () => 4);
    raw[1] = 12;

    const adjustedEnabled = raw.map((strokes, idx) => adjustedStrokesForInput(strokes, idx + 1, true));
    const adjustedDisabled = raw.map((strokes, idx) => adjustedStrokesForInput(strokes, idx + 1, false));

    const enabled = calculateCallawayResult(
      adjustedEnabled.map((adjusted, idx) => ({ holeNumber: idx + 1, rawStrokes: raw[idx], adjustedStrokes: adjusted })),
      { maxDoubleParEnabled: true, capDeductionPerHoleDoublePar: true, excludeWorseThanDoubleBogey: false }
    );

    const disabled = calculateCallawayResult(
      adjustedDisabled.map((adjusted, idx) => ({ holeNumber: idx + 1, rawStrokes: raw[idx], adjustedStrokes: adjusted })),
      { maxDoubleParEnabled: false, capDeductionPerHoleDoublePar: true, excludeWorseThanDoubleBogey: false }
    );

    expect(enabled.adjustedGross).toBe(disabled.adjustedGross - 6);
  });

  it("supports deduction cap per hole toggle", () => {
    const raw = Array.from({ length: 18 }, () => 4);
    raw[0] = 20;

    const scores = fromRaw(raw);

    const capped = calculateCallawayResult(scores, {
      maxDoubleParEnabled: false,
      capDeductionPerHoleDoublePar: true,
      excludeWorseThanDoubleBogey: false
    });

    const uncapped = calculateCallawayResult(scores, {
      maxDoubleParEnabled: false,
      capDeductionPerHoleDoublePar: false,
      excludeWorseThanDoubleBogey: false
    });

    expect(capped.handicapAllowance).toBeLessThan(uncapped.handicapAllowance);
    expect(capped.handicapAllowance).toBe(12);
    expect(uncapped.handicapAllowance).toBe(24);
  });

  it("handles half-hole entitlement using half of the smallest selected worst hole rounded up", () => {
    const raw = Array.from({ length: 18 }, () => 4);
    raw[0] = 10;
    raw[1] = 9;

    const result = calculateCallawayResult(fromRaw(raw), {
      maxDoubleParEnabled: false,
      capDeductionPerHoleDoublePar: false,
      excludeWorseThanDoubleBogey: false
    });

    expect(result.adjustedGross).toBe(83);
    expect(result.entitlement).toBe(1.5);
    expect(result.selectedHoleNumbers).toEqual([1]);
    expect(result.halfHoleAppliedTo).toBe(2);
    expect(result.handicapAllowance).toBe(15);
  });

  it("applies tie-break: lowest net, then lower adjusted gross, then shared placing", () => {
    const rows = sharedPlacings([
      {
        playerId: "a",
        playerName: "Alice",
        holesCompleted: 18,
        frontNine: 40,
        backNine: 41,
        grossTotal: 81,
        grossToPar: 9,
        adjustedGross: 81,
        handicapAllowance: 10,
        netScore: 71
      },
      {
        playerId: "b",
        playerName: "Bob",
        holesCompleted: 18,
        frontNine: 42,
        backNine: 40,
        grossTotal: 82,
        grossToPar: 10,
        adjustedGross: 82,
        handicapAllowance: 11,
        netScore: 71
      },
      {
        playerId: "c",
        playerName: "Chris",
        holesCompleted: 18,
        frontNine: 39,
        backNine: 42,
        grossTotal: 81,
        grossToPar: 9,
        adjustedGross: 81,
        handicapAllowance: 10,
        netScore: 71
      }
    ]);

    expect(rows[0].playerName).toBe("Alice");
    expect(rows[1].playerName).toBe("Chris");
    expect(rows[0].place).toBe("T1");
    expect(rows[1].place).toBe("T1");
    expect(rows[2].place).toBe("3");
  });

  it("keeps all holes eligible for deduction (including 17 and 18)", () => {
    const raw = Array.from({ length: 18 }, () => 4);
    raw[16] = 12;
    raw[17] = 11;

    const scores = fromRaw(raw).map((score) => {
      const hole = HOLES.find((h) => h.hole === score.holeNumber)!;
      return { ...score, adjustedStrokes: Math.min(score.rawStrokes, hole.par * 2) };
    });

    const result = calculateCallawayResult(scores, {
      maxDoubleParEnabled: true,
      capDeductionPerHoleDoublePar: true,
      excludeWorseThanDoubleBogey: false
    });

    expect(result.selectedHoleNumbers.includes(17) || result.halfHoleAppliedTo === 17).toBe(true);
  });

  it("can exclude holes worse than double bogey from deductions", () => {
    const raw = Array.from({ length: 18 }, () => 4);
    raw[0] = 10; // par 4, +6, excluded when toggle is on
    raw[1] = 9; // par 3, +6, excluded when toggle is on
    raw[2] = 8; // par 5, +3, excluded when toggle is on

    const scores = fromRaw(raw);

    const excluded = calculateCallawayResult(scores, {
      maxDoubleParEnabled: false,
      capDeductionPerHoleDoublePar: false,
      excludeWorseThanDoubleBogey: true
    });

    const included = calculateCallawayResult(scores, {
      maxDoubleParEnabled: false,
      capDeductionPerHoleDoublePar: false,
      excludeWorseThanDoubleBogey: false
    });

    expect(excluded.handicapAllowance).toBeLessThan(included.handicapAllowance);
  });

  it("uses 6 worst holes at adjusted gross 127 (par 72 table)", () => {
    const result = calculateCallawayResult(scoresForAdjustedGross(127), {
      maxDoubleParEnabled: false,
      capDeductionPerHoleDoublePar: false,
      excludeWorseThanDoubleBogey: false
    });

    expect(result.adjustedGross).toBe(127);
    expect(result.entitlement).toBe(6);
    expect(result.selectedHoleNumbers.length).toBe(6);
  });

  it("matches entitlement and adjustment across all par-72 Callaway score bands", () => {
    for (let score = 72; score <= 130; score += 1) {
      const result = calculateCallawayResult(scoresForAdjustedGross(score), {
        maxDoubleParEnabled: false,
        capDeductionPerHoleDoublePar: false,
        excludeWorseThanDoubleBogey: false
      });

      expect(result.adjustedGross).toBe(score);
      expect(result.entitlement).toBe(expectedEntitlement(score));
      expect(result.adjustment).toBe(expectedAdjustment(score));
    }
  });
});
