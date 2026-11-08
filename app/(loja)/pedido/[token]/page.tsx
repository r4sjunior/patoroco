import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, MessageCircle, XCircle } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { getSettings } from "@/lib/catalog";
import { brl, dateTime, PAYMENT_LABEL, statusLabel, whatsappLink, type OrderStatus } from "@/lib/format";
import { getOrderByToken } from "@/lib/orders";
import { CopyPix } from "./copy-pix";

export const dynamic = "force-dynamic";
// O link do pedido traz dados pessoais: não deve ser indexado nem vazar como referrer.
export const metadata: Metadata = { title: "Acompanhar pedido | Pato Roco", robots: { index: false, follow: false }, referrer: "no-referrer" };

const STEPS: OrderStatus[] = ["novo", "preparando", "pronto", "concluido"];

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const [order, settings] = await Promise.all([getOrderByToken(token), getSettings()]);
  if (!order) notFound();

  const current = STEPS.indexOf(order.status);
  const finished = order.status === "concluido" || order.status === "cancelado";

  const message = [
    `Olá! Acabei de fazer o pedido #${order.id} pelo app:`,
    ...order.items.map((i) => `• ${i.quantity}x ${i.name}`),
    `Total: ${brl(order.totalCents)} (${PAYMENT_LABEL[order.paymentMethod]})`,
    order.fulfillment === "entrega" ? `Entrega: ${order.address}, ${order.zoneName}` : "Vou retirar no local",
    `Nome: ${order.customerName}`,
  ].join("\n");

  return (
    <main className="page">
      {!finished && <AutoRefresh seconds={15} />}
      <h1 className="page-title">Pedido #{order.id}</h1>
      <p className="muted">Feito em {dateTime(order.createdAt)}. Esta tela atualiza sozinha.</p>

      {order.status === "cancelado" ? (
        <section className="panel canceled">
          <XCircle size={28} aria-hidden />
          <div>
            <strong>Pedido cancelado</strong>
            {order.cancelReason && <p>{order.cancelReason}</p>}
            <p>Dúvidas? Fale com a gente no WhatsApp.</p>
          </div>
        </section>
      ) : (
        <ol className="timeline">
          {STEPS.map((s, i) => (
            <li key={s} className={i < current ? "done" : i === current ? "now" : ""} aria-current={i === current ? "step" : undefined}>
              <span className="dot">{i <= current && <Check size={16} aria-hidden />}</span>
              {statusLabel(s, order.fulfillment)}
            </li>
          ))}
        </ol>
      )}

      {order.paymentMethod === "pix" && !finished && settings.pixKey && (
        <section className="panel">
          <h2>Pagar com Pix</h2>
          <p className="muted">Chave Pix do Pato Roco:</p>
          <CopyPix value={settings.pixKey} />
        </section>
      )}

      <section className="panel">
        <h2>Resumo</h2>
        <ul className="summary">
          {order.items.map((i, idx) => (
            <li key={idx}>
              <span>
                {i.quantity}x {i.name}
              </span>
              <span>{brl(i.unitPriceCents * i.quantity)}</span>
            </li>
          ))}
          {order.fulfillment === "entrega" && (
            <li>
              <span>Entrega ({order.zoneName})</span>
              <span>{order.deliveryFeeCents === 0 ? "Grátis" : brl(order.deliveryFeeCents)}</span>
            </li>
          )}
          <li className="total">
            <span>Total</span>
            <span>{brl(order.totalCents)}</span>
          </li>
        </ul>
        <dl className="facts">
          <dt>Pagamento</dt>
          <dd>
            {PAYMENT_LABEL[order.paymentMethod]}
            {order.changeForCents ? `, troco para ${brl(order.changeForCents)}` : ""}
          </dd>
          <dt>{order.fulfillment === "entrega" ? "Entregar em" : "Retirar em"}</dt>
          <dd>
            {order.fulfillment === "entrega" ? `${order.address}, ${order.zoneName}${order.reference ? ` (${order.reference})` : ""}` : settings.address}
          </dd>
          {order.notes && (
            <>
              <dt>Observação</dt>
              <dd>{order.notes}</dd>
            </>
          )}
        </dl>
      </section>

      {settings.whatsapp && (
        <a className="btn-wa btn-block" href={whatsappLink(settings.whatsapp, message)} target="_blank" rel="noreferrer">
          <MessageCircle size={22} aria-hidden /> Avisar no WhatsApp
        </a>
      )}
      <Link href="/" className="btn-ghost btn-block">
        Voltar ao cardápio
      </Link>
    </main>
  );
}
