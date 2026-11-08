import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query } from "./db";
import { UserError } from "./format";
import { passwordMatches } from "./session";

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await scryptAsync(password, salt, KEY_LENGTH)).toString("hex")}`;
}

async function hashMatches(attempt: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  return timingSafeEqual(await scryptAsync(attempt, salt, KEY_LENGTH), expected);
}

async function readState() {
  const [row] = await query<{ hash: string | null; version: number }>(
    `SELECT admin_password_hash AS hash, admin_password_version AS version FROM settings WHERE id = 1`,
  );
  return row;
}

export async function passwordVersion(): Promise<number> {
  return (await readState()).version;
}

/** Vale a senha trocada pelo admin. Enquanto não houver uma, vale a de ADMIN_PASSWORD. */
export async function checkAdminPassword(attempt: string): Promise<boolean> {
  const { hash } = await readState();
  return hash ? hashMatches(attempt, hash) : passwordMatches(attempt);
}

/** Troca a senha e devolve a nova versão, que invalida as sessões anteriores. */
export async function changeAdminPassword(current: string, next: string, confirmation: string): Promise<number> {
  if (!(await checkAdminPassword(current))) throw new UserError("A senha atual está incorreta.");
  if (next.length < MIN_PASSWORD_LENGTH) throw new UserError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (next.length > 200) throw new UserError("A nova senha é longa demais.");
  if (next !== confirmation) throw new UserError("A confirmação não é igual à nova senha.");
  if (next === current) throw new UserError("A nova senha precisa ser diferente da atual.");
  const [row] = await query<{ version: number }>(
    `UPDATE settings SET admin_password_hash = $1, admin_password_version = admin_password_version + 1 WHERE id = 1 RETURNING admin_password_version AS version`,
    [await hashPassword(next)],
  );
  return row.version;
}
