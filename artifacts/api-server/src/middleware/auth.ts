import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

export type AppRole = "ADMIN" | "PHARMACIST" | "STAFF";
export type AuthUser = { id: number; name: string; email: string; role: AppRole };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const SESSION_COOKIE = "pharmacy_session";

function getCookie(req: Request, name: string) {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}

export function createSessionId() {
  return randomBytes(32).toString("hex");
}

export function setSessionCookie(res: Response, sessionId: string) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800;${secure}`);
}

export function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export async function resolveUser(req: Request) {
  const sessionId = getCookie(req, SESSION_COOKIE);
  if (!sessionId) return undefined;
  const result = await pool.query<AuthUser & { expires_at: Date }>(
    `SELECT u.id, u.name, u.email, u.role, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW() AND u.active = true
     LIMIT 1`,
    [sessionId],
  );
  return result.rows[0] ? {
    id: result.rows[0].id,
    name: result.rows[0].name,
    email: result.rows[0].email,
    role: result.rows[0].role,
  } : undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    req.user = user;
    return next();
  } catch (error) {
    logger.error({ error }, "Unable to resolve user session");
    return res.status(500).json({ error: "Unable to authenticate request" });
  }
}

export function requireRoles(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    return next();
  };
}

export function auditHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}