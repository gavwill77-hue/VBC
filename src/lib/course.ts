export type HoleMeta = {
  hole: number;
  par: 3 | 4 | 5;
  strokeIndex: number;
};

export const COURSE_NAME = "Numurkah Golf and Bowls Club (Mens)";
export const COURSE_PAR = 72;

export const HOLES: HoleMeta[] = [
  { hole: 1, par: 4, strokeIndex: 15 },
  { hole: 2, par: 3, strokeIndex: 2 },
  { hole: 3, par: 5, strokeIndex: 12 },
  { hole: 4, par: 3, strokeIndex: 3 },
  { hole: 5, par: 4, strokeIndex: 4 },
  { hole: 6, par: 5, strokeIndex: 11 },
  { hole: 7, par: 3, strokeIndex: 17 },
  { hole: 8, par: 4, strokeIndex: 14 },
  { hole: 9, par: 5, strokeIndex: 16 },
  { hole: 10, par: 4, strokeIndex: 10 },
  { hole: 11, par: 4, strokeIndex: 7 },
  { hole: 12, par: 4, strokeIndex: 1 },
  { hole: 13, par: 5, strokeIndex: 8 },
  { hole: 14, par: 4, strokeIndex: 13 },
  { hole: 15, par: 3, strokeIndex: 6 },
  { hole: 16, par: 5, strokeIndex: 5 },
  { hole: 17, par: 4, strokeIndex: 9 },
  { hole: 18, par: 3, strokeIndex: 18 }
];

export const HOLE_MAP = new Map(HOLES.map((hole) => [hole.hole, hole]));

export function holeEntryOrder(startHole: 1 | 10): number[] {
  return startHole === 1
    ? Array.from({ length: 18 }, (_, i) => i + 1)
    : [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9];
}

export function maxDoubleParForHole(holeNumber: number): number {
  const hole = HOLE_MAP.get(holeNumber);
  if (!hole) {
    throw new Error(`Unknown hole ${holeNumber}`);
  }
  return hole.par * 2;
}
