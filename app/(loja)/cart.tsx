"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartLine {
  productId: number;
  name: string;
  priceCents: number;
  quantity: number;
}

interface CartValue {
  lines: CartLine[];
  ready: boolean;
  count: number;
  subtotal: number;
  setQuantity: (p: Omit<CartLine, "quantity">, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);
const KEY = "pr_carrinho";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navegação privada: o carrinho só não sobrevive a recarregar a página.
  }
}
export const storage = { read, write };

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe depois de montar
    setLines(read<CartLine[]>(KEY, []));
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) write(KEY, lines);
  }, [lines, ready]);

  const setQuantity = useCallback<CartValue["setQuantity"]>((p, quantity) => {
    setLines((cur) => {
      const rest = cur.filter((l) => l.productId !== p.productId);
      if (quantity <= 0) return rest;
      const existing = cur.some((l) => l.productId === p.productId);
      const line = { ...p, quantity };
      return existing ? cur.map((l) => (l.productId === p.productId ? line : l)) : [...rest, line];
    });
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      ready,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: lines.reduce((n, l) => n + l.quantity * l.priceCents, 0),
      setQuantity,
      clear: () => setLines([]),
    }),
    [lines, ready, setQuantity],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de CartProvider");
  return ctx;
}
