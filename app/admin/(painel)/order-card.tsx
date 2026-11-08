import { MessageCircle } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { brl, formatPhone, PAYMENT_LABEL, statusLabel, time, whatsappLink } from "@/lib/format";
import type { Order } from "@/lib/orders";
import { advanceOrderAction, cancelOrderAction } from "../actions";

function nextLabel(o: Order) {
  if (o.status === "novo") return "Aceitar e preparar";
  if (o.status === "preparando") return o.fulfillment === "entrega" ? "Saiu para entrega" : "Pronto para retirar";
  return "Concluir e receber";
}

export function OrderCard({ order: o }: { order: Order }) {
  const text = `Olá, ${o.customerName}! Sobre seu pedido #${o.id} no Pato Roco: ${statusLabel(o.status, o.fulfillment)}.`;
  return (
    <article className={o.status === "novo" ? "order order-new" : "order"}>
      <header className="order-head">
        <strong>#{o.id}</strong>
        <span className="muted">{time(o.createdAt)}</span>
        <strong className="order-total">{brl(o.totalCents)}</strong>
      </header>
      <ul className="order-items">
        {o.items.map((i, idx) => (
          <li key={idx}>
            <b>{i.quantity}x</b> {i.name}
          </li>
        ))}
      </ul>
      <dl className="order-facts">
        <dt>Cliente</dt>
        <dd>
          {o.customerName}
          {o.customerPhone && (
            <>
              {" · "}
              <a href={whatsappLink(o.customerPhone, text)} target="_blank" rel="noreferrer" className="wa-link">
                <MessageCircle size={14} aria-hidden /> {formatPhone(o.customerPhone)}
              </a>
            </>
          )}
        </dd>
        <dt>{o.fulfillment === "entrega" ? "Entrega" : "Retirada"}</dt>
        <dd>
          {o.fulfillment === "entrega" ? `${o.address}, ${o.zoneName}${o.reference ? ` (${o.reference})` : ""}` : "No local"}
        </dd>
        <dt>Pagamento</dt>
        <dd>
          {PAYMENT_LABEL[o.paymentMethod]}
          {o.changeForCents ? ` · troco para ${brl(o.changeForCents)} (levar ${brl(o.changeForCents - o.totalCents)})` : ""}
        </dd>
        {o.notes && (
          <>
            <dt>Obs.</dt>
            <dd className="order-note">{o.notes}</dd>
          </>
        )}
      </dl>
      <ActionForm action={advanceOrderAction} className="order-advance">
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="from" value={o.status} />
        {o.status === "pronto" && (
          <label className="field field-inline">
            Recebido em
            <select name="payment" defaultValue={o.paymentMethod}>
              {Object.entries(PAYMENT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className={o.status === "pronto" ? "btn btn-ok btn-block" : "btn btn-primary btn-block"}>{nextLabel(o)}</button>
      </ActionForm>
      <details className="order-cancel">
        <summary>Cancelar pedido</summary>
        <ActionForm action={cancelOrderAction} className="row-form" confirm={`Cancelar o pedido #${o.id}? O estoque será devolvido.`}>
          <input type="hidden" name="id" value={o.id} />
          <input name="reason" placeholder="Motivo (o cliente vê)" maxLength={200} aria-label="Motivo do cancelamento" />
          <button className="btn btn-danger">Cancelar</button>
        </ActionForm>
      </details>
    </article>
  );
}
