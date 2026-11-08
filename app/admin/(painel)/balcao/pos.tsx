"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { brl, PAYMENT_LABEL, parseMoney, type PaymentMethod } from "@/lib/format";
import { counterSaleAction } from "../../actions";

interface P {
  id: number;
  name: string;
  priceCents: number;
  available: number | null;
}

function safeMoney(s: string): number | null {
  if (!s.trim()) return 0;
  try {
    return parseMoney(s);
  } catch {
    return null;
  }
}

export function Pos({ products, cashOpen }: { products: P[]; cashOpen: boolean }) {
  const [cart, setCart] = useState<Record<number, number>>({});
  const [payment, setPayment] = useState<PaymentMethod>("dinheiro");
  const [discount, setDiscount] = useState("");
  const [received, setReceived] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const lines = products.filter((p) => cart[p.id] > 0).map((p) => ({ ...p, quantity: cart[p.id] }));
  const subtotal = lines.reduce((n, l) => n + l.priceCents * l.quantity, 0);
  const discountCents = safeMoney(discount);
  const total = subtotal - (discountCents ?? 0);
  const receivedCents = safeMoney(received);
  const change = receivedCents ? receivedCents - total : null;

  const setQty = (id: number, q: number) => {
    setDone(null);
    setCart((c) => ({ ...c, [id]: Math.max(0, q) }));
  };

  function finish() {
    setError(null);
    start(async () => {
      const r = await counterSaleAction({
        lines: lines.map((l) => ({ productId: l.id, quantity: l.quantity })),
        payment,
        discount,
        customerName,
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setDone(`Venda de ${brl(total)} registrada.`);
      setCart({});
      setDiscount("");
      setReceived("");
      setCustomerName("");
    });
  }

  return (
    <div className="pos">
      <section className="pos-products" aria-label="Produtos">
        {products.length === 0 && <p className="muted">Cadastre produtos no Cardápio.</p>}
        {products.map((p) => {
          const q = cart[p.id] ?? 0;
          const out = p.available !== null && q >= p.available;
          return (
            <button key={p.id} type="button" className="pos-product" disabled={out || !cashOpen} onClick={() => setQty(p.id, q + 1)}>
              <strong>{p.name}</strong>
              <span>{brl(p.priceCents)}</span>
              <small>{p.available === null ? "Sem controle de estoque" : p.available === 0 ? "Esgotado" : `${p.available} disponíveis`}</small>
              {q > 0 && <b className="pos-qty">{q}</b>}
            </button>
          );
        })}
      </section>

      <section className="card pos-ticket" aria-label="Venda atual">
        <h2>Venda atual</h2>
        {done && <p className="form-ok" role="status">{done}</p>}
        {lines.length === 0 ? (
          <p className="muted">Toque nos produtos para adicionar.</p>
        ) : (
          <ul className="ticket-lines">
            {lines.map((l) => (
              <li key={l.id}>
                <span>{l.name}</span>
                <div className="mini-stepper">
                  <button type="button" aria-label={`Diminuir ${l.name}`} onClick={() => setQty(l.id, l.quantity - 1)}>
                    <Minus size={16} aria-hidden />
                  </button>
                  <output>{l.quantity}</output>
                  <button type="button" aria-label={`Aumentar ${l.name}`} disabled={l.available !== null && l.quantity >= l.available} onClick={() => setQty(l.id, l.quantity + 1)}>
                    <Plus size={16} aria-hidden />
                  </button>
                </div>
                <span className="num">{brl(l.priceCents * l.quantity)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="seg" role="radiogroup" aria-label="Forma de pagamento">
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={payment === m} className={payment === m ? "on" : ""} onClick={() => setPayment(m)}>
              {PAYMENT_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="grid-2">
          <label className="field">
            Desconto (R$)
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </label>
          {payment === "dinheiro" ? (
            <label className="field">
              Recebeu (R$)
              <input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </label>
          ) : (
            <label className="field">
              Cliente (opcional)
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={80} />
            </label>
          )}
        </div>
        {discountCents === null && <p className="form-err">Desconto inválido.</p>}

        <div className="ticket-total">
          <span>Total</span>
          <strong>{brl(Math.max(total, 0))}</strong>
        </div>
        {payment === "dinheiro" && change !== null && (
          <div className={change < 0 ? "ticket-change neg" : "ticket-change"}>
            <span>{change < 0 ? "Falta" : "Troco"}</span>
            <strong>{brl(Math.abs(change))}</strong>
          </div>
        )}
        {error && <p className="form-err" role="alert">{error}</p>}
        <button
          type="button"
          className="btn btn-ok btn-block btn-lg"
          disabled={pending || !cashOpen || lines.length === 0 || discountCents === null || total < 0 || (change !== null && change < 0)}
          onClick={finish}
        >
          {pending ? "Registrando…" : "Registrar venda"}
        </button>
      </section>
    </div>
  );
}
