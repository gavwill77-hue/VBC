import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(3).max(32),
  secret: z.string().min(6).max(64)
});

export const scoreEntrySchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  strokes: z.number().int().min(1).max(50).optional(),
  firstDrivePlayerId: z.string().min(1).nullable().optional(),
  roundNumber: z.union([z.literal(1), z.literal(2)]).optional()
}).refine((value) => value.strokes !== undefined || value.firstDrivePlayerId !== undefined, {
  message: "Provide strokes or firstDrivePlayerId"
});

export const quickEntrySchema = z.object({
  roundNumber: z.union([z.literal(1), z.literal(2)]).optional(),
  scores: z.array(
    z.object({
      holeNumber: z.number().int().min(1).max(18),
      strokes: z.number().int().min(1).max(50),
      firstDrivePlayerId: z.string().min(1).nullable().optional()
    })
  ).length(18)
});

export const adminSettingsSchema = z.object({
  eventName: z.string().min(1).max(80),
  eventDate: z.string().date(),
  roundStartHole: z.union([z.literal(1), z.literal(10)]),
  activeRoundNumber: z.union([z.literal(1), z.literal(2)]),
  maxDoubleParEnabled: z.boolean(),
  capDeductionPerHoleDoublePar: z.boolean(),
  excludeWorseThanDoubleBogey: z.boolean(),
  ambroseRequiredDrivesPerPlayer: z.number().int().min(1).max(18),
  maxInputStrokes: z.number().int().min(10).max(30)
});

export const playerPinSchema = z.object({
  playerId: z.string().min(1),
  name: z.string().min(1).max(60),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/),
  pin: z.string().regex(/^\d{6}$/).optional()
});
