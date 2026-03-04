import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    redirect("/leaderboard");
  }
  return user;
}

export async function activeEvent() {
  const event = await prisma.event.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" }
  });
  if (!event) {
    throw new Error("No active event");
  }
  return event;
}
