import { randomBytes } from "node:crypto";
import { z } from "zod";
import { query, tx, type Tx } from "./db";
import { requireOpenSession } from "./cash";
import { releaseStock, reserveStock } from "./stock";
import { digits, TZ, UserError, type Fulfillment, type OrderStatus, type PaymentMethod } from "./format";

export interface OrderItem {
  orderId: number;
  name: string;
  unitPriceCents: number;
  quantity: number;
}
export interface Order {
  id: number;
  token: string;
  channel: "online" | "balcao";
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  fulfillment: Fulfillment;
  zoneName: string;
  deliveryFeeCents: number;
  address: string;
  reference: string;
  paymentMethod: PaymentMethod;
  changeForCents: number | null;
  notes: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidAt: Date | null;
  cancelReason: string;
  createdAt: Date;
  items: OrderItem[];
}

const COLS = `id, token, channel, status, customer_name AS "customerName", customer_phone AS "customerPhone",
  fulfillment, zone_name AS "zoneName", delivery_fee_cents AS "deliveryFeeCents", address, reference,
  payment_method AS "paymentMethod", change_for_cents AS "changeForCents", notes,
  subtotal_cents AS "subtotalCents", discount_cents AS "discountCents", total_cents AS "totalCents",
  paid_at AS "paidAt", cancel_reason AS "cancelReason", created_at AS "createdAt"`;

async function withItems(orders: Omit<Order, "items">[]): Promise<Order[]> {
  if (orders.length === 0) return [];
  const items = await query<OrderItem>(
    `SELECT order_id AS "orderId", product_name AS name, unit_price_cents AS "unitPriceCents", quantity
     FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id`,
    [orders.map((o) => o.id)],
  );
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}

export async function getOrderByToken(token: string): Promise<Order | null> {
  const rows = await query<Omit<Order, "items">>(`SELECT ${COLS} FROM orders WHERE token = $1`, [token]);
  return (await withItems(rows))[0] ?? null;
}

export async function ordersStatusByTokens(tokens: string[]) {
  return query<{ token: string; id: number; status: OrderStatus; fulfillment: Fulfillment; totalCents: number; createdAt: Date }>(
    `SELECT token, id, status, fulfillment, total_cents AS "totalCents", created_at AS "createdAt"
     FROM orders WHERE token = ANY($1::text[]) ORDER BY id DESC`,
    [tokens],
  );
}

export async function listActiveOrders(): Promise<Order[]> {
  const rows = await query<Omit<Order, "items">>(
    `SELECT ${COLS} FROM orders WHERE status IN ('novo', 'preparando', 'pronto') ORDER BY id`,
  );
  return withItems(rows);
}

export async function listFinishedOnDay(day: string): Promise<Order[]> {
  const rows = await query<Omit<Order, "items">>(
    `SELECT ${COLS} FROM orders
     WHERE status IN ('concluido', 'cancelado') AND (created_at AT TIME ZONE '${TZ}')::date = $1::date
     ORDER BY id DESC LIMIT 100`,
    [day],
  );
  return withItems(rows);
}

export async function pulse(): Promise<{ newCount: number; lastId: number }> {
  const [r] = await query<{ newCount: number; lastId: number }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'novo')::int AS "newCount", COALESCE(MAX(id), 0)::int AS "lastId" FROM orders WHERE channel = 'online'`,
  );
  return r;
}

const lineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99, "Quantidade máxima por item: 99."),
});

export const onlineOrderSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80, "Nome muito longo."),
  phone: z
    .string()
    .transform(digits)
    .refine((d) => d.length === 10 || d.length === 11, "Informe um telefone com DDD."),
  fulfillment: z.enum(["entrega", "retirada"]),
  zoneId: z.number().int().positive().nullable(),
  address: z.string().trim().max(200, "Endereço muito longo."),
  reference: z.string().trim().max(120, "Ponto de referência muito longo."),
  payment: z.enum(["pix", "dinheiro", "cartao"]),
  changeForCents: z.number().int().min(0).max(100_000_000).nullable(),
  notes: z.string().trim().max(300, "Observação muito longa."),
  items: z.array(lineSchema).min(1, "Seu carrinho está vazio.").max(30),
});
export type OnlineOrderInput = z.input<typeof onlineOrderSchema>;

function mergeLines(lines: { productId: number; quantity: number }[]) {
  const m = new Map<number, number>();
  for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
  return [...m].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Preço sempre vem do banco, nunca do navegador. */
async function priceLines(t: Tx, lines: { productId: number; quantity: number }[]) {
  const products = await t.query<{ id: number; name: string; priceCents: number }>(
    `SELECT id, name, price_cents AS "priceCents" FROM products WHERE active AND id = ANY($1::int[])`,
    [lines.map((l) => l.productId)],
  );
  const priced = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    if (!p) throw new UserError("Um dos produtos não está mais disponível. Revise o carrinho.");
    return { ...l, name: p.name, unitPriceCents: p.priceCents };
  });
  return { priced, subtotal: priced.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0) };
}

async function insertItems(t: Tx, orderId: number, priced: { productId: number; name: string; unitPriceCents: number; quantity: number }[]) {
  for (const l of priced) {
    await t.query(`INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity) VALUES ($1, $2, $3, $4, $5)`, [
      orderId,
      l.productId,
      l.name,
      l.unitPriceCents,
      l.quantity,
    ]);
  }
}

/** Pedido feito pelo cliente. O estoque é reservado na hora, para nunca vender o que acabou. */
export async function placeOnlineOrder(raw: unknown): Promise<{ id: number; token: string }> {
  const parsed = onlineOrderSchema.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const input = parsed.data;
  const lines = mergeLines(input.items);

  return tx(async (t) => {
    const [settings] = await t.query<{ open: boolean }>(`SELECT store_open AS open FROM settings WHERE id = 1`);
    if (!settings.open) throw new UserError("A loja está fechada no momento.");

    const { priced, subtotal } = await priceLines(t, lines);

    let zoneName = "";
    let fee = 0;
    if (input.fulfillment === "entrega") {
      const [zone] = input.zoneId
        ? await t.query<{ name: string; fee: number }>(`SELECT name, fee_cents AS fee FROM delivery_zones WHERE id = $1 AND active`, [input.zoneId])
        : [];
      if (!zone) throw new UserError("Escolha o bairro da entrega.");
      if (input.address.length < 5) throw new UserError("Informe o endereço da entrega.");
      zoneName = zone.name;
      fee = zone.fee;
    }

    const total = subtotal + fee;
    const changeFor = input.payment === "dinheiro" ? input.changeForCents : null;
    if (changeFor !== null && changeFor < total) throw new UserError("O valor para troco é menor que o total do pedido.");

    const token = randomBytes(16).toString("hex");
    const [order] = await t.query<{ id: number }>(
      `INSERT INTO orders (token, channel, status, customer_name, customer_phone, fulfillment, zone_name, delivery_fee_cents,
         address, reference, payment_method, change_for_cents, notes, subtotal_cents, total_cents)
       VALUES ($1, 'online', 'novo', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        token,
        input.name,
        input.phone,
        input.fulfillment,
        zoneName,
        fee,
        input.fulfillment === "entrega" ? input.address : "",
        input.fulfillment === "entrega" ? input.reference : "",
        input.payment,
        changeFor,
        input.notes,
        subtotal,
        total,
      ],
    );
    await insertItems(t, order.id, priced);
    await reserveStock(t, order.id, lines);
    return { id: order.id, token };
  });
}

/** Venda no balcão: já sai paga e entra direto no caixa. */
export async function counterSale(input: {
  lines: { productId: number; quantity: number }[];
  payment: PaymentMethod;
  discountCents: number;
  customerName: string;
}): Promise<{ id: number }> {
  const lines = mergeLines(input.lines);
  if (lines.length === 0) throw new UserError("Adicione ao menos um produto.");
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 99)) throw new UserError("Quantidade inválida.");
  return tx(async (t) => {
    const sessionId = await requireOpenSession(t);
    const { priced, subtotal } = await priceLines(t, lines);
    if (input.discountCents < 0 || input.discountCents > subtotal) throw new UserError("Desconto maior que o valor da venda.");
    const total = subtotal - input.discountCents;
    const [order] = await t.query<{ id: number }>(
      `INSERT INTO orders (token, channel, status, customer_name, fulfillment, payment_method, subtotal_cents, discount_cents, total_cents, paid_at)
       VALUES ($1, 'balcao', 'concluido', $2, 'balcao', $3, $4, $5, $6, now()) RETURNING id`,
      [randomBytes(16).toString("hex"), input.customerName.trim().slice(0, 80), input.payment, subtotal, input.discountCents, total],
    );
    await insertItems(t, order.id, priced);
    await reserveStock(t, order.id, lines);
    await t.query(`INSERT INTO cash_entries (session_id, type, method, amount_cents, description, order_id) VALUES ($1, 'venda', $2, $3, $4, $5)`, [
      sessionId,
      input.payment,
      total,
      `Balcão #${order.id}`,
      order.id,
    ]);
    return { id: order.id };
  });
}

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { novo: "preparando", preparando: "pronto", pronto: "concluido" };

/**
 * Avança o pedido. `from` é o status que a tela mostrava: se outra aba já avançou, recusa em vez de pular etapa.
 * Ao concluir, registra o recebimento no caixa (`payment` corrige a forma, se o cliente mudou de ideia).
 */
export async function advanceOrder(id: number, from: OrderStatus, payment?: PaymentMethod) {
  await tx(async (t) => {
    const [o] = await t.query<{ status: OrderStatus; total: number; method: PaymentMethod }>(
      `SELECT status, total_cents AS total, payment_method AS method FROM orders WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!o) throw new UserError("Pedido não encontrado.");
    if (o.status !== from) throw new UserError("Este pedido já foi atualizado. A tela será recarregada.");
    const next = NEXT[o.status];
    if (!next) throw new UserError("Este pedido já foi encerrado.");
    if (next === "concluido") {
      const sessionId = await requireOpenSession(t);
      const method = payment ?? o.method;
      await t.query(`UPDATE orders SET status = 'concluido', payment_method = $1, paid_at = now() WHERE id = $2`, [method, id]);
      await t.query(`INSERT INTO cash_entries (session_id, type, method, amount_cents, description, order_id) VALUES ($1, 'venda', $2, $3, $4, $5)`, [
        sessionId,
        method,
        o.total,
        `Pedido #${id}`,
        id,
      ]);
    } else {
      await t.query(`UPDATE orders SET status = $1 WHERE id = $2`, [next, id]);
    }
  });
}

/** Cancela, devolve o estoque e, se já tinha sido recebido, lança o estorno no caixa aberto. */
export async function cancelOrder(id: number, reason: string) {
  await tx(async (t) => {
    const [o] = await t.query<{ status: OrderStatus; total: number; method: PaymentMethod; paidAt: Date | null }>(
      `SELECT status, total_cents AS total, payment_method AS method, paid_at AS "paidAt" FROM orders WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!o) throw new UserError("Pedido não encontrado.");
    if (o.status === "cancelado") throw new UserError("Este pedido já foi cancelado.");
    if (o.paidAt) {
      const sessionId = await requireOpenSession(t);
      await t.query(`INSERT INTO cash_entries (session_id, type, method, amount_cents, description, order_id) VALUES ($1, 'estorno', $2, $3, $4, $5)`, [
        sessionId,
        o.method,
        -o.total,
        `Estorno do pedido #${id}`,
        id,
      ]);
    }
    await releaseStock(t, id);
    await t.query(`UPDATE orders SET status = 'cancelado', cancel_reason = $1 WHERE id = $2`, [reason.trim().slice(0, 200), id]);
  });
}
