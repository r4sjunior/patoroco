import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Sem imports do Next: é usado tanto pelo proxy.ts quanto pelas actions.
export const SESSION_COOKIE = "pr_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;

const sha = (s: string) => createHash("sha256").update(s).digest();

export function authConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.AUTH_SECRET);
}

export function passwordMatches(attempt: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  return timingSafeEqual(sha(attempt), sha(real));
}

// A chave inclui a senha: trocar ADMIN_PASSWORD derruba as sessões abertas.
function sign(payload: string): string {
  return createHmac("sha256", `${process.env.AUTH_SECRET}:${process.env.ADMIN_PASSWORD}`).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + MAX_AGE_SECONDS);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !authConfigured()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(exp) * 1000 > now;
}
