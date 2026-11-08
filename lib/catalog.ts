import { query, tx } from "./db";
import { UserError } from "./format";

export interface Settings {
  storeOpen: boolean;
  whatsapp: string;
  pixKey: string;
  address: string;
  notice: string;
}
export interface Zone {
  id: number;
  name: string;
  feeCents: number;
  active: boolean;
}
export interface RecipeLine {
  stockItemId: number;
  quantity: number;
}
export interface Product {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  image: string;
  highlight: boolean;
  active: boolean;
  sort: number;
  recipe: RecipeLine[];
  /** Quantas unidades o estoque permite vender. null = sem controle de estoque. */
  available: number | null;
  limitedBy: string | null;
}

export async function getSettings(): Promise<Settings> {
  const [s] = await query<Settings>(
    `SELECT store_open AS "storeOpen", whatsapp, pix_key AS "pixKey", address, notice FROM settings WHERE id = 1`,
  );
  return s;
}

export async function saveSettings(s: Omit<Settings, "storeOpen">) {
  await query(`UPDATE settings SET whatsapp = $1, pix_key = $2, address = $3, notice = $4 WHERE id = 1`, [
    s.whatsapp,
    s.pixKey,
    s.address,
    s.notice,
  ]);
}

export async function setStoreOpen(open: boolean) {
  await query(`UPDATE settings SET store_open = $1 WHERE id = 1`, [open]);
}

export async function listZones(includeInactive = false): Promise<Zone[]> {
  return query<Zone>(
    `SELECT id, name, fee_cents AS "feeCents", active FROM delivery_zones
     ${includeInactive ? "" : "WHERE active"} ORDER BY active DESC, fee_cents, name`,
  );
}

export async function saveZone(z: { id?: number; name: string; feeCents: number; active: boolean }) {
  if (!z.name.trim()) throw new UserError("Informe o nome do bairro.");
  if (z.id) {
    await query(`UPDATE delivery_zones SET name = $1, fee_cents = $2, active = $3 WHERE id = $4`, [z.name.trim(), z.feeCents, z.active, z.id]);
  } else {
    await query(`INSERT INTO delivery_zones (name, fee_cents, active) VALUES ($1, $2, $3)`, [z.name.trim(), z.feeCents, z.active]);
  }
}

export async function listProducts(opts: { includeInactive?: boolean } = {}): Promise<Product[]> {
  const [rows, recipes] = await Promise.all([
    query<Omit<Product, "recipe" | "available" | "limitedBy">>(
      `SELECT id, name, description, price_cents AS "priceCents", image, highlight, active, sort
       FROM products ${opts.includeInactive ? "" : "WHERE active"} ORDER BY active DESC, sort, name`,
    ),
    query<{ productId: number; stockItemId: number; quantity: number; stock: number; itemName: string }>(
      `SELECT r.product_id AS "productId", r.stock_item_id AS "stockItemId", r.quantity::float8 AS quantity,
              s.quantity::float8 AS stock, s.name AS "itemName"
       FROM product_recipe r JOIN stock_items s ON s.id = r.stock_item_id`,
    ),
  ]);
  return rows.map((p) => {
    const lines = recipes.filter((r) => r.productId === p.id);
    let available: number | null = null;
    let limitedBy: string | null = null;
    for (const l of lines) {
      const can = Math.floor(l.stock / l.quantity + 1e-9);
      if (available === null || can < available) {
        available = can;
        limitedBy = l.itemName;
      }
    }
    return {
      ...p,
      recipe: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity })),
      available,
      limitedBy,
    };
  });
}

export async function saveProduct(p: {
  id?: number;
  name: string;
  description: string;
  priceCents: number;
  highlight: boolean;
  active: boolean;
  sort: number;
  recipe: RecipeLine[];
}) {
  if (!p.name.trim()) throw new UserError("Informe o nome do produto.");
  await tx(async (t) => {
    let id = p.id;
    if (id) {
      await t.query(
        `UPDATE products SET name = $1, description = $2, price_cents = $3, highlight = $4, active = $5, sort = $6 WHERE id = $7`,
        [p.name.trim(), p.description.trim(), p.priceCents, p.highlight, p.active, p.sort, id],
      );
    } else {
      const [row] = await t.query<{ id: number }>(
        `INSERT INTO products (name, description, price_cents, highlight, active, sort) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [p.name.trim(), p.description.trim(), p.priceCents, p.highlight, p.active, p.sort],
      );
      id = row.id;
    }
    await t.query(`DELETE FROM product_recipe WHERE product_id = $1`, [id]);
    for (const line of p.recipe) {
      await t.query(`INSERT INTO product_recipe (product_id, stock_item_id, quantity) VALUES ($1, $2, $3)`, [id, line.stockItemId, line.quantity]);
    }
  });
}

/** Janela fixa de tentativas. Retorna false quando o limite foi ultrapassado. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [row] = await query<{ hits: number }>(
    `INSERT INTO rate_limits (key, window_start, hits) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING hits`,
    [key, windowSeconds],
  );
  return row.hits <= limit;
}
