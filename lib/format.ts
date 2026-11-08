// Funções puras, usadas tanto no servidor quanto no navegador.
export const TZ = "America/Fortaleza";

/** Erro com mensagem que pode ser mostrada ao usuário. */
export class UserError extends Error {}

export type ActionResult = { ok: true } | { error: string };

export type PaymentMethod = "pix" | "dinheiro" | "cartao";
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
};

export type OrderStatus = "novo" | "preparando" | "pronto" | "concluido" | "cancelado";
export type Fulfillment = "entrega" | "retirada" | "balcao";

export function statusLabel(status: OrderStatus, fulfillment: Fulfillment): string {
  switch (status) {
    case "novo":
      return "Recebido";
    case "preparando":
      return "Em preparo";
    case "pronto":
      return fulfillment === "entrega" ? "Saiu para entrega" : "Pronto para retirar";
    case "concluido":
      return fulfillment === "entrega" ? "Entregue" : "Concluído";
    case "cancelado":
      return "Cancelado";
  }
}

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (cents: number) => brlFmt.format((cents || 0) / 100);

const qtyFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export const qty = (n: number) => qtyFmt.format(n);

const dtFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const tFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const dateTime = (d: Date | string) => dtFmt.format(new Date(d));
export const time = (d: Date | string) => tFmt.format(new Date(d));

/** Data de hoje (ou deslocada em dias) no fuso da loja, como YYYY-MM-DD. */
export function localDay(offsetDays = 0, base = new Date()): string {
  const d = new Date(base.getTime() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export const digits = (s: string) => s.replace(/\D/g, "");

export function formatPhone(raw: string): string {
  const d = digits(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

export function whatsappLink(phone: string, text?: string): string {
  const d = digits(phone);
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** "30", "30,50", "1.234,50" ou "30.5" → centavos. */
export function parseMoney(input: string, campo = "Valor"): number {
  const s = input.trim().replace(/^R\$\s*/i, "");
  if (!s) throw new UserError(`${campo}: informe um valor.`);
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(normal)) throw new UserError(`${campo}: valor inválido.`);
  return Math.round(parseFloat(normal) * 100);
}

/** "2", "0,5" ou "1.5" → número não negativo. */
export function parseQty(input: string, campo = "Quantidade"): number {
  const n = Number(input.trim().replace(",", "."));
  if (!input.trim() || !Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new UserError(`${campo}: quantidade inválida.`);
  }
  return Math.round(n * 1000) / 1000;
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;
