"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { addManualEntry, closeCash, openCash } from "@/lib/cash";
import { rateLimit, saveProduct, saveSettings, saveZone, setStoreOpen } from "@/lib/catalog";
import { parseMoney, parseQty, UserError, type ActionResult, type OrderStatus, type PaymentMethod } from "@/lib/format";
import { advanceOrder, cancelOrder, counterSale } from "@/lib/orders";
import { authConfigured, createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { moveStock, saveStockItem } from "@/lib/stock";
import { requireAdmin } from "./auth";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const num = (fd: FormData, name: string) => {
  const n = Number(fd.get(name));
  if (!Number.isInteger(n) || n <= 0) throw new UserError("Registro inválido. Recarregue a página.");
  return n;
};
const METHODS: PaymentMethod[] = ["pix", "dinheiro", "cartao"];
function method(value: unknown): PaymentMethod {
  if (!METHODS.includes(value as PaymentMethod)) throw new UserError("Escolha a forma de pagamento.");
  return value as PaymentMethod;
}

/** Toda action do admin passa por aqui: confere a sessão, traduz erros e atualiza as telas. */
async function run(fn: () => Promise<void>): Promise<ActionResult> {
  await requireAdmin();
  try {
    await fn();
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("Falha em action do admin", err);
    return { error: "Não foi possível salvar. Tente de novo." };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  return { ok: true };
}

/* ---------- Sessão ---------- */
export async function loginAction(fd: FormData): Promise<ActionResult> {
  if (!authConfigured()) return { error: "Defina ADMIN_PASSWORD e AUTH_SECRET nas variáveis de ambiente." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!(await rateLimit(`login:${ip}`, 8, 900))) {
    return { error: "Muitas tentativas. Aguarde 15 minutos." };
  }
  if (!passwordMatches(String(fd.get("password") ?? ""))) return { error: "Senha incorreta." };
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && h.get("x-forwarded-proto") !== "http",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

/* ---------- Pedidos ---------- */
export async function advanceOrderAction(fd: FormData) {
  return run(async () => {
    const payment = fd.get("payment");
    await advanceOrder(num(fd, "id"), text(fd, "from") as OrderStatus, payment ? method(payment) : undefined);
  });
}

export async function cancelOrderAction(fd: FormData) {
  return run(() => cancelOrder(num(fd, "id"), text(fd, "reason")));
}

export async function counterSaleAction(input: {
  lines: { productId: number; quantity: number }[];
  payment: PaymentMethod;
  discount: string;
  customerName: string;
}): Promise<ActionResult> {
  return run(async () => {
    await counterSale({
      lines: input.lines,
      payment: method(input.payment),
      discountCents: input.discount.trim() ? parseMoney(input.discount, "Desconto") : 0,
      customerName: input.customerName,
    });
  });
}

/* ---------- Estoque ---------- */
export async function moveStockAction(fd: FormData) {
  return run(async () => {
    const type = text(fd, "type");
    if (type !== "entrada" && type !== "saida" && type !== "ajuste") throw new UserError("Escolha o tipo de lançamento.");
    await moveStock(num(fd, "id"), type, parseQty(text(fd, "amount")), text(fd, "note"));
  });
}

export async function saveStockItemAction(fd: FormData) {
  return run(async () => {
    const id = fd.get("id") ? num(fd, "id") : undefined;
    await saveStockItem({
      id,
      name: text(fd, "name"),
      unit: text(fd, "unit"),
      minQuantity: parseQty(text(fd, "min") || "0", "Estoque mínimo"),
      quantity: id ? undefined : parseQty(text(fd, "quantity") || "0", "Saldo inicial"),
      active: id ? fd.get("active") === "on" : true,
    });
  });
}

/* ---------- Caixa ---------- */
export async function openCashAction(fd: FormData) {
  return run(() => openCash(parseMoney(text(fd, "opening") || "0", "Valor de abertura")));
}

export async function cashEntryAction(fd: FormData) {
  return run(async () => {
    const type = text(fd, "type");
    if (type !== "suprimento" && type !== "sangria" && type !== "despesa") throw new UserError("Escolha o tipo de lançamento.");
    await addManualEntry(type, parseMoney(text(fd, "amount")), text(fd, "description"));
  });
}

export async function closeCashAction(fd: FormData) {
  return run(() => closeCash(parseMoney(text(fd, "counted"), "Dinheiro contado"), text(fd, "notes")));
}

/* ---------- Cardápio ---------- */
export async function saveProductAction(fd: FormData) {
  return run(async () => {
    const recipe: { stockItemId: number; quantity: number }[] = [];
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith("rec_") || !String(value).trim()) continue;
      const quantity = parseQty(String(value), "Consumo de estoque");
      if (quantity > 0) recipe.push({ stockItemId: Number(key.slice(4)), quantity });
    }
    await saveProduct({
      id: fd.get("id") ? num(fd, "id") : undefined,
      name: text(fd, "name"),
      description: text(fd, "description"),
      priceCents: parseMoney(text(fd, "price"), "Preço"),
      highlight: fd.get("highlight") === "on",
      active: fd.get("active") === "on",
      sort: Number(fd.get("sort")) || 0,
      recipe,
    });
  });
}

/* ---------- Ajustes ---------- */
export async function setStoreOpenAction(fd: FormData) {
  return run(() => setStoreOpen(fd.get("open") === "1"));
}

export async function saveSettingsAction(fd: FormData) {
  return run(() =>
    saveSettings({
      whatsapp: text(fd, "whatsapp").replace(/\D/g, ""),
      pixKey: text(fd, "pixKey"),
      address: text(fd, "address"),
      notice: text(fd, "notice"),
    }),
  );
}

export async function saveZoneAction(fd: FormData) {
  return run(() =>
    saveZone({
      id: fd.get("id") ? num(fd, "id") : undefined,
      name: text(fd, "name"),
      feeCents: parseMoney(text(fd, "fee") || "0", "Taxa de entrega"),
      active: fd.get("id") ? fd.get("active") === "on" : true,
    }),
  );
}
