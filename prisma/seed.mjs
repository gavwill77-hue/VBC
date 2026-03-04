import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const COURSE_PAR = 72;

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.holeScore.deleteMany();
  await prisma.round.deleteMany();
  await prisma.player.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: hashSecret("ChangeMe!2026"),
      role: "ADMIN"
    }
  });

  const event = await prisma.event.create({
    data: {
      name: "Golf Weekend",
      eventDate: new Date(),
      totalRounds: 2,
      activeRoundNumber: 1,
      roundStartHole: 1,
      maxDoubleParEnabled: true,
      capDeductionPerHoleDoublePar: true,
      excludeWorseThanDoubleBogey: false,
      ambroseRequiredDrivesPerPlayer: 6,
      maxInputStrokes: 20,
      callawayTableVersion: "par72_liveabout_v1"
    }
  });

  for (let i = 1; i <= 16; i += 1) {
    const username = `player${String(i).padStart(2, "0")}`;
    const pin = `${100000 + i}`;
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashSecret(pin),
        role: "PLAYER"
      }
    });

    const player = await prisma.player.create({
      data: {
        eventId: event.id,
        userId: user.id,
        name: `Player ${i}`,
        order: i
      }
    });

    const groupNumber = Math.ceil(i / 4);
    await prisma.roundGroupAssignment.createMany({
      data: [
        { eventId: event.id, roundNumber: 1, groupNumber, playerId: player.id },
        { eventId: event.id, roundNumber: 2, groupNumber, playerId: player.id }
      ]
    });
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "SEED_INITIALISED",
      payloadJson: JSON.stringify({ eventId: event.id, coursePar: COURSE_PAR })
    }
  });

  console.log("Seed complete");
  console.log("Admin login: admin / ChangeMe!2026");
  console.log("Players: player01..player16 / PIN 100001..100016");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
