import { query, tx, type Tx } from "./db";
import { round3, UserError } from "./format";

export interface StockItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  active: boolean;
}
export interface StockMovement {
  id: number;
  itemName: string;
  unit: string;
  type: "entrada" | "saida" | "ajuste" | "venda" | "estorno";
  delta: number;
  balanceAfter: number;
  note: string;
  orderId: number | null;
  createdAt: Date;
}

const ITEM_COLS = `id, name, unit, quantity::float8 AS quantity, min_quantity::float8 AS "minQuantity", active`;

export async function listStock(includeInactive = false): Promise<StockItem[]> {
  return query<StockItem>(`SELECT ${ITEM_COLS} FROM stock_items ${includeInactive ? "" : "WHERE active"} ORDER BY active DESC, name`);
}

export async function lowStock(): Promise<StockItem[]> {
  return query<StockItem>(`SELECT ${ITEM_COLS} FROM stock_items WHERE active AND quantity <= min_quantity ORDER BY quantity / NULLIF(min_quantity, 0), name`);
}

export async function recentMovements(limit = 30): Promise<StockMovement[]> {
  return query<StockMovement>(
    `SELECT m.id, s.name AS "itemName", s.unit, m.type, m.delta::float8 AS delta, m.balance_after::float8 AS "balanceAfter",
            m.note, m.order_id AS "orderId", m.created_at AS "createdAt"
     FROM stock_movements m JOIN stock_items s ON s.id = m.stock_item_id
     ORDER BY m.id DESC LIMIT $1`,
    [limit],
  );
}

export async function saveStockItem(i: { id?: number; name: string; unit: string; minQuantity: number; active: boolean; quantity?: number }) {
  if (!i.name.trim()) throw new UserError("Informe o nome do item.");
  if (i.id) {
    await query(`UPDATE stock_items SET name = $1, unit = $2, min_quantity = $3, active = $4 WHERE id = $5`, [
      i.name.trim(),
      i.unit.trim() || "un",
      i.minQuantity,
      i.active,
      i.id,
    ]);
    return;
  }
  await tx(async (t) => {
    const [row] = await t.query<{ id: number }>(
      `INSERT INTO stock_items (name, unit, quantity, min_quantity) VALUES ($1, $2, $3, $4) RETURNING id`,
      [i.name.trim(), i.unit.trim() || "un", i.quantity ?? 0, i.minQuantity],
    );
    if (i.quantity) {
      await t.query(`INSERT INTO stock_movements (stock_item_id, type, delta, balance_after, note) VALUES ($1, 'entrada', $2, $2, 'Saldo inicial')`, [row.id, i.quantity]);
    }
  });
}

/** Lançamento manual. "ajuste" define o saldo contado; os demais somam ou subtraem. */
export async function moveStock(itemId: number, type: "entrada" | "saida" | "ajuste", amount: number, note: string) {
  if (type !== "ajuste" && amount <= 0) throw new UserError("A quantidade precisa ser maior que zero.");
  await tx(async (t) => {
    const [item] = await t.query<{ quantity: number }>(`SELECT quantity::float8 AS quantity FROM stock_items WHERE id = $1 FOR UPDATE`, [itemId]);
    if (!item) throw new UserError("Item não encontrado.");
    const next = round3(type === "ajuste" ? amount : type === "entrada" ? item.quantity + amount : item.quantity - amount);
    if (next < 0) throw new UserError("A saída é maior que o saldo em estoque.");
    await t.query(`UPDATE stock_items SET quantity = $1 WHERE id = $2`, [next, itemId]);
    await t.query(`INSERT INTO stock_movements (stock_item_id, type, delta, balance_after, note) VALUES ($1, $2, $3, $4, $5)`, [
      itemId,
      type,
      round3(next - item.quantity),
      next,
      note.trim().slice(0, 200),
    ]);
  });
}

/** Baixa o estoque da venda. Ordem fixa por id evita deadlock entre pedidos simultâneos. */
export async function reserveStock(t: Tx, orderId: number, lines: { productId: number; quantity: number }[]) {
  const rec = await t.query<{ productId: number; stockItemId: number; quantity: number }>(
    `SELECT product_id AS "productId", stock_item_id AS "stockItemId", quantity::float8 AS quantity
     FROM product_recipe WHERE product_id = ANY($1::int[])`,
    [lines.map((l) => l.productId)],
  );
  const needed = new Map<number, number>();
  for (const l of lines) {
    for (const r of rec.filter((x) => x.productId === l.productId)) {
      needed.set(r.stockItemId, round3((needed.get(r.stockItemId) ?? 0) + r.quantity * l.quantity));
    }
  }
  for (const id of [...needed.keys()].sort((a, b) => a - b)) {
    const amount = needed.get(id)!;
    const [row] = await t.query<{ balance: number }>(
      `UPDATE stock_items SET quantity = quantity - $1::numeric WHERE id = $2 AND quantity >= $1::numeric RETURNING quantity::float8 AS balance`,
      [amount, id],
    );
    if (!row) {
      const [item] = await t.query<{ name: string }>(`SELECT name FROM stock_items WHERE id = $1`, [id]);
      throw new UserError(`Estoque insuficiente de ${item?.name ?? "um dos itens"}. Reduza a quantidade.`);
    }
    await t.query(`INSERT INTO stock_movements (stock_item_id, type, delta, balance_after, order_id) VALUES ($1, 'venda', $2, $3, $4)`, [id, -amount, row.balance, orderId]);
  }
}

/** Devolve ao estoque o que a venda baixou, olhando o que foi registrado (não a receita atual). */
export async function releaseStock(t: Tx, orderId: number) {
  const moved = await t.query<{ id: number; net: number }>(
    `SELECT stock_item_id AS id, SUM(delta)::float8 AS net FROM stock_movements WHERE order_id = $1 GROUP BY stock_item_id ORDER BY stock_item_id`,
    [orderId],
  );
  for (const m of moved) {
    if (m.net >= 0) continue;
    const back = round3(-m.net);
    const [row] = await t.query<{ balance: number }>(`UPDATE stock_items SET quantity = quantity + $1::numeric WHERE id = $2 RETURNING quantity::float8 AS balance`, [back, m.id]);
    await t.query(`INSERT INTO stock_movements (stock_item_id, type, delta, balance_after, order_id, note) VALUES ($1, 'estorno', $2, $3, $4, 'Pedido cancelado')`, [m.id, back, row.balance, orderId]);
  }
}
