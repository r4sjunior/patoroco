import { query } from "./db";
import { TZ, type PaymentMethod } from "./format";

export interface SalesReport {
  totalCents: number;
  orders: number;
  units: number;
  canceled: number;
  daily: { day: string; totalCents: number; orders: number }[];
  byProduct: { name: string; units: number; totalCents: number }[];
  byMethod: { method: PaymentMethod; totalCents: number; orders: number }[];
  byChannel: { channel: "online" | "balcao"; totalCents: number; orders: number }[];
}

// Vendas contam pela data do recebimento, no fuso da loja. Pedido cancelado depois sai do relatório.
const RANGE = `paid_at >= ($1::date)::timestamp AT TIME ZONE '${TZ}' AND paid_at < ($2::date + 1)::timestamp AT TIME ZONE '${TZ}' AND status = 'concluido'`;

export async function salesReport(from: string, to: string): Promise<SalesReport> {
  const p = [from, to];
  const [totals, units, canceled, daily, byProduct, byMethod, byChannel] = await Promise.all([
    query<{ totalCents: number; orders: number }>(`SELECT COALESCE(SUM(total_cents), 0)::int AS "totalCents", COUNT(*)::int AS orders FROM orders WHERE ${RANGE}`, p),
    query<{ units: number }>(`SELECT COALESCE(SUM(i.quantity), 0)::int AS units FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${RANGE}`, p),
    query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM orders WHERE status = 'cancelado'
       AND created_at >= ($1::date)::timestamp AT TIME ZONE '${TZ}' AND created_at < ($2::date + 1)::timestamp AT TIME ZONE '${TZ}'`,
      p,
    ),
    query<{ day: string; totalCents: number; orders: number }>(
      `SELECT to_char(paid_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, SUM(total_cents)::int AS "totalCents", COUNT(*)::int AS orders
       FROM orders WHERE ${RANGE} GROUP BY 1 ORDER BY 1`,
      p,
    ),
    query<{ name: string; units: number; totalCents: number }>(
      `SELECT i.product_name AS name, SUM(i.quantity)::int AS units, SUM(i.quantity * i.unit_price_cents)::int AS "totalCents"
       FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${RANGE} GROUP BY 1 ORDER BY 3 DESC`,
      p,
    ),
    query<{ method: PaymentMethod; totalCents: number; orders: number }>(
      `SELECT payment_method AS method, SUM(total_cents)::int AS "totalCents", COUNT(*)::int AS orders FROM orders WHERE ${RANGE} GROUP BY 1 ORDER BY 2 DESC`,
      p,
    ),
    query<{ channel: "online" | "balcao"; totalCents: number; orders: number }>(
      `SELECT channel, SUM(total_cents)::int AS "totalCents", COUNT(*)::int AS orders FROM orders WHERE ${RANGE} GROUP BY 1 ORDER BY 2 DESC`,
      p,
    ),
  ]);

  // Preenche os dias sem venda: um buraco no gráfico também é informação.
  const map = new Map(daily.map((d) => [d.day, d]));
  const filled: SalesReport["daily"] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    filled.push(map.get(key) ?? { day: key, totalCents: 0, orders: 0 });
  }

  return { ...totals[0], units: units[0].units, canceled: canceled[0].n, daily: filled, byProduct, byMethod, byChannel };
}

export async function salesRows(from: string, to: string) {
  return query<{
    id: number;
    paidAt: Date;
    channel: string;
    customerName: string;
    customerPhone: string;
    fulfillment: string;
    paymentMethod: PaymentMethod;
    subtotalCents: number;
    discountCents: number;
    deliveryFeeCents: number;
    totalCents: number;
    items: string;
  }>(
    `SELECT o.id, o.paid_at AS "paidAt", o.channel, o.customer_name AS "customerName", o.customer_phone AS "customerPhone",
            o.fulfillment, o.payment_method AS "paymentMethod", o.subtotal_cents AS "subtotalCents", o.discount_cents AS "discountCents",
            o.delivery_fee_cents AS "deliveryFeeCents", o.total_cents AS "totalCents",
            (SELECT string_agg(i.quantity || 'x ' || i.product_name, ', ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS items
     FROM orders o WHERE ${RANGE} ORDER BY o.id DESC`,
    [from, to],
  );
}
