-- CreateTable
CREATE TABLE "AmbroseGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "groupNumber" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AmbroseGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AmbroseGroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AmbroseGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AmbroseGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AmbroseGroupMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AmbroseGroup_eventId_groupNumber_key" ON "AmbroseGroup"("eventId", "groupNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AmbroseGroupMember_playerId_key" ON "AmbroseGroupMember"("playerId");
