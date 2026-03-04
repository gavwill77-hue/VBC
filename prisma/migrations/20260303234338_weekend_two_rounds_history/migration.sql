/*
  Warnings:

  - A unique constraint covering the columns `[eventId,userId]` on the table `Player` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Player_userId_key";

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
    "maxInputStrokes" INTEGER NOT NULL DEFAULT 20,
    "callawayTableVersion" TEXT NOT NULL DEFAULT 'par72_liveabout_v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Event" ("callawayTableVersion", "capDeductionPerHoleDoublePar", "createdAt", "eventDate", "id", "isActive", "maxDoubleParEnabled", "maxInputStrokes", "name", "updatedAt") SELECT "callawayTableVersion", "capDeductionPerHoleDoublePar", "createdAt", "eventDate", "id", "isActive", "maxDoubleParEnabled", "maxInputStrokes", "name", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE TABLE "new_Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "startHole" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "lockedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "adjustedGross" INTEGER,
    "grossTotal" INTEGER,
    "handicapAllowance" REAL,
    "netScore" REAL,
    "entitlement" TEXT,
    "adjustmentFactor" REAL,
    "calcInputsJson" TEXT,
    "calculationVersion" TEXT NOT NULL DEFAULT 'callaway_par72_allholes_v1',
    "lastCalculatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Round_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Round" ("adjustedGross", "adjustmentFactor", "calcInputsJson", "calculationVersion", "createdAt", "entitlement", "grossTotal", "handicapAllowance", "id", "lastCalculatedAt", "lockedByAdmin", "netScore", "playerId", "startHole", "status", "updatedAt") SELECT "adjustedGross", "adjustmentFactor", "calcInputsJson", "calculationVersion", "createdAt", "entitlement", "grossTotal", "handicapAllowance", "id", "lastCalculatedAt", "lockedByAdmin", "netScore", "playerId", "startHole", "status", "updatedAt" FROM "Round";
DROP TABLE "Round";
ALTER TABLE "new_Round" RENAME TO "Round";
CREATE UNIQUE INDEX "Round_playerId_roundNumber_key" ON "Round"("playerId", "roundNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Player_eventId_userId_key" ON "Player"("eventId", "userId");
