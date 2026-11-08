"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { brl } from "@/lib/format";
import { useCart } from "./cart";

interface StepperProduct {
  id: number;
  name: string;
  priceCents: number;
  available: number | null;
}

export function ProductStepper({ product, storeOpen, large }: { product: StepperProduct; storeOpen: boolean; large?: boolean }) {
  const { lines, setQuantity, ready } = useCart();
  const qty = lines.find((l) => l.productId === product.id)?.quantity ?? 0;
  const max = Math.min(product.available ?? 99, 99);
  const line = { productId: product.id, name: product.name, priceCents: product.priceCents };

  if (product.available === 0) return <span className="sold-out">Esgotado</span>;
  if (!storeOpen) return <span className="sold-out">Fechado agora</span>;

  if (!ready || qty === 0) {
    return (
      <button type="button" className={large ? "btn-add btn-add-lg" : "btn-add"} onClick={() => setQuantity(line, 1)} disabled={!ready}>
        <Plus size={large ? 24 : 20} aria-hidden /> {large ? "Quero o meu!" : "Adicionar"}
      </button>
    );
  }
  return (
    <div className={large ? "stepper stepper-lg" : "stepper"} role="group" aria-label={`Quantidade de ${product.name}`}>
      <button type="button" aria-label="Diminuir" onClick={() => setQuantity(line, qty - 1)}>
        <Minus size={20} aria-hidden />
      </button>
      <output aria-live="polite">{qty}</output>
      <button type="button" aria-label="Aumentar" onClick={() => setQuantity(line, qty + 1)} disabled={qty >= max}>
        <Plus size={20} aria-hidden />
      </button>
    </div>
  );
}

export function CartBar() {
  const { count, subtotal, ready } = useCart();
  if (!ready || count === 0) return null;
  return (
    <div className="cart-bar">
      <Link href="/pedir">
        <span className="cart-count">
          <ShoppingBag size={20} aria-hidden /> {count} {count === 1 ? "item" : "itens"}
        </span>
        <span className="cart-go">Finalizar pedido</span>
        <span className="cart-total">{brl(subtotal)}</span>
      </Link>
    </div>
  );
}
