import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "meteo_admin_session";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function adminPassword() {
  return process.env.ADMIN_PASSWORD ?? process.env.CRON_SECRET ?? "";
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? process.env.CRON_SECRET ?? "";
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function verifyAdminPassword(candidate: string) {
  const expected = Buffer.from(adminPassword());
  const received = Buffer.from(candidate);
  return expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(expected, received);
}

export function createAdminSession() {
  const payload = Buffer.from(JSON.stringify({
    role: "admin",
    expiresAt: Date.now() + SESSION_DURATION_MS,
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminSession(token: string | undefined) {
  if (!token || !sessionSecret()) return false;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return false;
  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(suppliedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      role?: string;
      expiresAt?: number;
    };
    return session.role === "admin" && Number(session.expiresAt) > Date.now();
  } catch {
    return false;
  }
}
