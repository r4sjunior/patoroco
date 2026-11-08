"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, Banknote, Bike, CreditCard, Minus, Plus, QrCode, Store } from "lucide-react";
import type { Zone } from "@/lib/catalog";
import { brl, parseMoney, UserError, whatsappLink, type PaymentMethod } from "@/lib/format";
import { placeOrderAction } from "../actions";
import { storage, useCart } from "../cart";

interface P {
  id: number;
  name: string;
  priceCents: number;
  available: number | null;
}
interface SavedCustomer {
  name: string;
  phone: string;
  zoneId: number | null;
  address: string;
  reference: string;
}
export interface SavedOrder {
  token: string;
}

const PAYMENTS: { id: PaymentMethod; label: string; icon: typeof QrCode }[] = [
  { id: "pix", label: "Pix", icon: QrCode },
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "cartao", label: "Cartão", icon: CreditCard },
];

export function Checkout({
  storeOpen,
  whatsapp,
  pickupAddress,
  zones,
  products,
}: {
  storeOpen: boolean;
  whatsapp: string;
  pickupAddress: string;
  zones: Zone[];
  products: P[];
}) {
  const cart = useCart();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<"entrega" | "retirada">(zones.length ? "entrega" : "retirada");
  const [zoneId, setZoneId] = useState<number | null>(zones.length === 1 ? zones[0].id : null);
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [needChange, setNeedChange] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const c = storage.read<SavedCustomer | null>("pr_cliente", null);
    if (!c) return;
    /* eslint-disable react-hooks/set-state-in-effect -- dados salvos só existem no navegador */
    setName(c.name ?? "");
    setPhone(c.phone ?? "");
    setAddress(c.address ?? "");
    setReference(c.reference ?? "");
    if (c.zoneId && zones.some((z) => z.id === c.zoneId)) setZoneId(c.zoneId);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [zones]);

  // Vale o preço e o estoque atuais do servidor, não o que ficou salvo no carrinho.
  const lines = cart.lines.flatMap((l) => {
    const p = products.find((x) => x.id === l.productId);
    return p ? [{ ...l, priceCents: p.priceCents, name: p.name, available: p.available }] : [];
  });
  const subtotal = lines.reduce((n, l) => n + l.priceCents * l.quantity, 0);
  const zone = zones.find((z) => z.id === zoneId);
  const fee = fulfillment === "entrega" ? (zone?.feeCents ?? 0) : 0;
  const total = subtotal + fee;
  const overStock = lines.find((l) => l.available !== null && l.quantity > l.available);

  if (!cart.ready || placed) {
    return <main className="page"><p className="empty">{placed ? "Pedido enviado! Abrindo o acompanhamento…" : "Carregando…"}</p></main>;
  }

  if (lines.length === 0) {
    return (
      <main className="page">
        <h1 className="page-title">Seu pedido</h1>
        <p className="empty">Seu carrinho está vazio.</p>
        <Link href="/" className="btn-primary">
          Ver o cardápio
        </Link>
      </main>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let changeForCents: number | null = null;
    if (payment === "dinheiro" && needChange) {
      try {
        changeForCents = parseMoney(changeFor, "Troco");
      } catch (err) {
        setError(err instanceof UserError ? err.message : "Valor do troco inválido.");
        return;
      }
    }
    start(async () => {
      const result = await placeOrderAction({
        name,
        phone,
        fulfillment,
        zoneId: fulfillment === "entrega" ? zoneId : null,
        address,
        reference,
        payment,
        changeForCents,
        notes,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      });
      if ("error" in result) {
        setError(result.error);
        router.refresh();
        return;
      }
      storage.write("pr_cliente", { name, phone, zoneId, address, reference } satisfies SavedCustomer);
      const previous = storage.read<SavedOrder[]>("pr_pedidos", []);
      storage.write("pr_pedidos", [{ token: result.token }, ...previous].slice(0, 20));
      setPlaced(true);
      cart.clear();
      router.push(`/pedido/${result.token}`);
    });
  }

  return (
    <main className="page">
      <Link href="/" className="back">
        <ArrowLeft size={18} aria-hidden /> Voltar ao cardápio
      </Link>
      <h1 className="page-title">Finalizar pedido</h1>

      {!storeOpen && <div className="closed-banner">Estamos fechados agora. Seu carrinho fica guardado aqui para quando abrirmos.</div>}

      <form onSubmit={submit} className="checkout">
        <section className="panel">
          <h2>Seu pedido</h2>
          <ul className="cart-lines">
            {lines.map((l) => (
              <li key={l.productId}>
                <div>
                  <strong>{l.name}</strong>
                  <span className="muted">{brl(l.priceCents)} cada</span>
                  {l.available !== null && l.quantity > l.available && (
                    <span className="line-warn">{l.available === 0 ? "Esgotou. Remova para continuar." : `Só restam ${l.available}.`}</span>
                  )}
                </div>
                <div className="stepper" role="group" aria-label={`Quantidade de ${l.name}`}>
                  <button type="button" aria-label="Diminuir" onClick={() => cart.setQuantity(l, l.quantity - 1)}>
                    <Minus size={20} aria-hidden />
                  </button>
                  <output>{l.quantity}</output>
                  <button type="button" aria-label="Aumentar" disabled={l.quantity >= Math.min(l.available ?? 99, 99)} onClick={() => cart.setQuantity(l, l.quantity + 1)}>
                    <Plus size={20} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Seus dados</h2>
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
          </label>
          <label>
            WhatsApp com DDD
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="(84) 90000-0000" maxLength={20} />
          </label>
        </section>

        <section className="panel">
          <h2>Como quer receber?</h2>
          <div className="choice-row">
            {zones.length > 0 && (
              <label className={fulfillment === "entrega" ? "choice on" : "choice"}>
                <input type="radio" name="fulfillment" checked={fulfillment === "entrega"} onChange={() => setFulfillment("entrega")} />
                <Bike size={22} aria-hidden /> Entrega
              </label>
            )}
            <label className={fulfillment === "retirada" ? "choice on" : "choice"}>
              <input type="radio" name="fulfillment" checked={fulfillment === "retirada"} onChange={() => setFulfillment("retirada")} />
              <Store size={22} aria-hidden /> Retirar
            </label>
          </div>

          {fulfillment === "retirada" ? (
            <p className="muted">Retire em: {pickupAddress}</p>
          ) : (
            <>
              <label>
                Bairro
                <select value={zoneId ?? ""} onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : null)} required>
                  <option value="">Escolha o bairro</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} · {z.feeCents === 0 ? "entrega grátis" : brl(z.feeCents)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">
                Seu bairro não está na lista?{" "}
                <a href={whatsappLink(whatsapp, "Olá! Vocês entregam no meu bairro?")} target="_blank" rel="noreferrer">
                  Pergunte no WhatsApp
                </a>
              </p>
              <label>
                Rua e número
                <input value={address} onChange={(e) => setAddress(e.target.value)} required minLength={5} maxLength={200} autoComplete="street-address" />
              </label>
              <label>
                <span>Ponto de referência <span className="opt">(opcional)</span></span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
              </label>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Pagamento</h2>
          <p className="muted">O pagamento é feito na entrega ou na retirada.</p>
          <div className="choice-row">
            {PAYMENTS.map(({ id, label, icon: Icon }) => (
              <label key={id} className={payment === id ? "choice on" : "choice"}>
                <input type="radio" name="payment" checked={payment === id} onChange={() => setPayment(id)} />
                <Icon size={22} aria-hidden /> {label}
              </label>
            ))}
          </div>
          {payment === "dinheiro" && (
            <>
              <label className="check">
                <input type="checkbox" checked={needChange} onChange={(e) => setNeedChange(e.target.checked)} /> Preciso de troco
              </label>
              {needChange && (
                <label>
                  Troco para quanto?
                  <input value={changeFor} onChange={(e) => setChangeFor(e.target.value)} inputMode="decimal" placeholder="50,00" required />
                </label>
              )}
            </>
          )}
          <label>
            <span>Observação <span className="opt">(opcional)</span></span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} />
          </label>
        </section>

        <section className="panel totals">
          <div>
            <span>Produtos</span>
            <span>{brl(subtotal)}</span>
          </div>
          {fulfillment === "entrega" && (
            <div>
              <span>Entrega</span>
              <span>{!zone ? "Escolha o bairro" : fee === 0 ? "Grátis!" : brl(fee)}</span>
            </div>
          )}
          <div className="total">
            <span>Total</span>
            <span>{brl(total)}</span>
          </div>
        </section>

        {error && (
          <p className="form-err" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary btn-block" disabled={pending || !storeOpen || Boolean(overStock)}>
          {pending ? "Enviando…" : "Enviar pedido"}
        </button>
      </form>
    </main>
  );
}
