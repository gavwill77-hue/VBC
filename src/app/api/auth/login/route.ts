import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, createSession, setSessionCookie, verifySecret } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login payload" }, { status: 400 });
  }

  if (!checkRateLimit(parsed.data.username, request)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { username: parsed.data.username }, include: { players: true } });
  if (!user || !verifySecret(parsed.data.secret, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid username or secret" }, { status: 401 });
  }

  const token = await createSession({ sub: user.id, role: user.role, username: user.username });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, role: user.role });
}
