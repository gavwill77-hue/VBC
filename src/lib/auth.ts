import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "golf_session";
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

export type SessionPayload = {
  sub: string;
  role: "ADMIN" | "PLAYER";
  username: string;
};

function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be set and at least 16 characters");
  }
  return new TextEncoder().encode(secret);
}

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export function verifySecret(secret: string, storedHash: string): boolean {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) {
    return false;
  }
  const actual = crypto.scryptSync(secret, salt, 64).toString("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(actual, "hex");
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(authSecret());
}

export async function readSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret());
    return {
      sub: payload.sub as string,
      role: payload.role as "ADMIN" | "PLAYER",
      username: payload.username as string
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return readSessionToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) {
    return null;
  }
  return prisma.user.findUnique({
    where: { id: session.sub },
    include: { players: true }
  });
}

function clientIp(request?: NextRequest): string {
  if (request) {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  }
  return "local";
}

export function checkRateLimit(username: string, request?: NextRequest): boolean {
  const key = `${clientIp(request)}:${username}`;
  const now = Date.now();
  const existing = rateLimitMap.get(key);

  if (!existing || existing.expiresAt < now) {
    rateLimitMap.set(key, { count: 1, expiresAt: now + 15 * 60 * 1000 });
    return true;
  }

  if (existing.count >= 10) {
    return false;
  }

  existing.count += 1;
  return true;
}
