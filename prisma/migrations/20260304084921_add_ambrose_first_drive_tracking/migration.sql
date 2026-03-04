-- AlterTable
ALTER TABLE "HoleScore" ADD COLUMN "firstDrivePlayerId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalRounds" INTEGER NOT NULL DEFAULT 2,
    "activeRoundNumber" INTEGER NOT NULL DEFAULT 1,
    "roundStartHole" INTEGER NOT NULL DEFAULT 1,
    "maxDoubleParEnabled" BOOLEAN NOT NULL DEFAULT true,
    "capDeductionPerHoleDoublePar" BOOLEAN NOT NULL DEFAULT true,
    "excludeWorseThanDoubleBogey" BOOLEAN NOT NULL DEFAULT false,
    "ambroseRequiredDrivesPerPlayer" INTEGER NOT NULL DEFAULT 6,
    "maxInputStrokes" INTEGER NOT NULL DEFAULT 20,
    "callawayTableVersion" TEXT NOT NULL DEFAULT 'par72_liveabout_v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Event" ("activeRoundNumber", "callawayTableVersion", "capDeductionPerHoleDoublePar", "createdAt", "eventDate", "excludeWorseThanDoubleBogey", "id", "isActive", "maxDoubleParEnabled", "maxInputStrokes", "name", "roundStartHole", "totalRounds", "updatedAt") SELECT "activeRoundNumber", "callawayTableVersion", "capDeductionPerHoleDoublePar", "createdAt", "eventDate", "excludeWorseThanDoubleBogey", "id", "isActive", "maxDoubleParEnabled", "maxInputStrokes", "name", "roundStartHole", "totalRounds", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
