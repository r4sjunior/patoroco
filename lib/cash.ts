import { query, tx, type Tx } from "./db";
import { UserError, type PaymentMethod } from "./format";

export interface CashSession {
  id: number;
  openedAt: Date;
  openingCents: number;
  closedAt: Date | null;
  expectedCents: number | null;
  countedCents: number | null;
  notes: string;
}
export interface CashEntry {
  id: number;
  type: "venda" | "suprimento" | "sangria" | "despesa" | "estorno";
  method: PaymentMethod;
  amountCents: number;
  description: string;
  orderId: number | null;
  createdAt: Date;
}
export interface CashSummary {
  salesCash: number;
  salesPix: number;
  salesCard: number;
  refunds: number;
  supplies: number;
  withdrawals: number;
  expenses: number;
  /** Dinheiro que deveria estar na gaveta agora. */
  expectedDrawer: number;
  /** Tudo o que a sessão faturou, em todas as formas de pagamento, já sem estornos. */
  salesTotal: number;
}

const SESSION_COLS = `id, opened_at AS "openedAt", opening_cents AS "openingCents", closed_at AS "closedAt",
  expected_cents AS "expectedCents", counted_cents AS "countedCents", notes`;

export async function getOpenSession(): Promise<CashSession | null> {
  const [s] = await query<CashSession>(`SELECT ${SESSION_COLS} FROM cash_sessions WHERE closed_at IS NULL`);
  return s ?? null;
}

export async function listClosedSessions(limit = 10): Promise<CashSession[]> {
  return query<CashSession>(`SELECT ${SESSION_COLS} FROM cash_sessions WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT $1`, [limit]);
}

export async function listEntries(sessionId: number): Promise<CashEntry[]> {
  return query<CashEntry>(
    `SELECT id, type, method, amount_cents AS "amountCents", description, order_id AS "orderId", created_at AS "createdAt"
     FROM cash_entries WHERE session_id = $1 ORDER BY id DESC`,
    [sessionId],
  );
}

export function summarize(openingCents: number, entries: Pick<CashEntry, "type" | "method" | "amountCents">[]): CashSummary {
  const s: CashSummary = { salesCash: 0, salesPix: 0, salesCard: 0, refunds: 0, supplies: 0, withdrawals: 0, expenses: 0, expectedDrawer: openingCents, salesTotal: 0 };
  for (const e of entries) {
    if (e.type === "venda") {
      if (e.method === "dinheiro") s.salesCash += e.amountCents;
      if (e.method === "pix") s.salesPix += e.amountCents;
      if (e.method === "cartao") s.salesCard += e.amountCents;
    }
    if (e.type === "estorno") s.refunds += e.amountCents;
    if (e.type === "suprimento") s.supplies += e.amountCents;
    if (e.type === "sangria") s.withdrawals += e.amountCents;
    if (e.type === "despesa") s.expenses += e.amountCents;
    if (e.type === "venda" || e.type === "estorno") s.salesTotal += e.amountCents;
    if (e.method === "dinheiro") s.expectedDrawer += e.amountCents;
  }
  return s;
}

export async function openCash(openingCents: number) {
  const open = await getOpenSession();
  if (open) throw new UserError("O caixa já está aberto.");
  try {
    await query(`INSERT INTO cash_sessions (opening_cents) VALUES ($1)`, [openingCents]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new UserError("O caixa já está aberto.");
    throw err;
  }
}

/** Sessão aberta dentro da transação; trava para não fechar no meio de uma venda. */
export async function requireOpenSession(t: Tx): Promise<number> {
  const [s] = await t.query<{ id: number }>(`SELECT id FROM cash_sessions WHERE closed_at IS NULL FOR UPDATE`);
  if (!s) throw new UserError("O caixa está fechado. Abra o caixa para registrar esse recebimento.");
  return s.id;
}

export async function addManualEntry(type: "suprimento" | "sangria" | "despesa", amountCents: number, description: string) {
  if (amountCents <= 0) throw new UserError("O valor precisa ser maior que zero.");
  await tx(async (t) => {
    const sessionId = await requireOpenSession(t);
    const signed = type === "suprimento" ? amountCents : -amountCents;
    await t.query(`INSERT INTO cash_entries (session_id, type, method, amount_cents, description) VALUES ($1, $2, 'dinheiro', $3, $4)`, [
      sessionId,
      type,
      signed,
      description.trim().slice(0, 200),
    ]);
  });
}

export async function closeCash(countedCents: number, notes: string) {
  await tx(async (t) => {
    const sessionId = await requireOpenSession(t);
    const [s] = await t.query<{ opening: number }>(`SELECT opening_cents AS opening FROM cash_sessions WHERE id = $1`, [sessionId]);
    const entries = await t.query<Pick<CashEntry, "type" | "method" | "amountCents">>(
      `SELECT type, method, amount_cents AS "amountCents" FROM cash_entries WHERE session_id = $1`,
      [sessionId],
    );
    const { expectedDrawer } = summarize(s.opening, entries);
    await t.query(`UPDATE cash_sessions SET closed_at = now(), expected_cents = $1, counted_cents = $2, notes = $3 WHERE id = $4`, [
      expectedDrawer,
      countedCents,
      notes.trim().slice(0, 300),
      sessionId,
    ]);
  });
}
