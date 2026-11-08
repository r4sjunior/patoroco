import { mkdirSync } from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Tx {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}
interface Driver extends Tx {
  tx<T>(fn: (t: Tx) => Promise<T>): Promise<T>;
}

async function pgDriver(url: string): Promise<Driver> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 20_000 });
  return {
    async query(sql, params = []) {
      return (await pool.query(sql, params as unknown[])).rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query(sql, params = []) {
            return (await client.query(sql, params as unknown[])).rows;
          },
          async exec(sql) {
            await client.query(sql);
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function pgliteDriver(): Promise<Driver> {
  // Na Vercel o disco é efêmero: um banco local perderia todos os pedidos.
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL não configurada. Conecte o banco Neon ao projeto na Vercel.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (!dir.includes("://")) mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  return {
    async query(sql, params = []) {
      return (await pg.query(sql, params as any[])).rows as any[];
    },
    async exec(sql) {
      await pg.exec(sql);
    },
    async tx(fn) {
      return (await pg.transaction(async (t) =>
        fn({
          async query(sql, params = []) {
            return (await t.query(sql, params as any[])).rows as any[];
          },
          async exec(sql) {
            await t.exec(sql);
          },
        }),
      )) as any;
    },
  };
}

async function migrate(d: Driver) {
  await d.tx(async (t) => {
    // Lock transacional funciona também através do pooler do Neon.
    await t.query("SELECT pg_advisory_xact_lock(720312)");
    await t.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const [{ v }] = await t.query<{ v: number }>("SELECT COALESCE(MAX(version), 0)::int AS v FROM schema_migrations");
    for (let i = v; i < MIGRATIONS.length; i++) {
      await t.exec(MIGRATIONS[i]);
      await t.query("INSERT INTO schema_migrations (version) VALUES ($1)", [i + 1]);
    }
  });
}

const g = globalThis as unknown as { __patoRocoDb?: Promise<Driver> };

function driver(): Promise<Driver> {
  if (!g.__patoRocoDb) {
    g.__patoRocoDb = (async () => {
      const url = process.env.DATABASE_URL;
      const d = url ? await pgDriver(url) : await pgliteDriver();
      await migrate(d);
      return d;
    })().catch((err) => {
      g.__patoRocoDb = undefined;
      throw err;
    });
  }
  return g.__patoRocoDb;
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await driver()).query<T>(sql, params);
}

export async function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  return (await driver()).tx(fn);
}
