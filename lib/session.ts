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

/** `version` é a versão da senha: quando a senha muda no banco, as sessões antigas deixam de valer. */
export function createSessionToken(version = 0, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000) + MAX_AGE_SECONDS}.${version}`;
  return `${payload}.${sign(payload)}`;
}

/** Confere assinatura e validade. Quem pode consultar o banco ainda compara a versão devolvida. */
export function readSessionToken(token: string | undefined, now = Date.now()): { version: number } | null {
  if (!token || !authConfigured()) return null;
  const [exp, version, sig] = token.split(".");
  if (!exp || !version || !sig || !/^\d+$/.test(exp) || !/^\d+$/.test(version)) return null;
  const expected = Buffer.from(sign(`${exp}.${version}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(exp) * 1000 > now ? { version: Number(version) } : null;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  return readSessionToken(token, now) !== null;
}
