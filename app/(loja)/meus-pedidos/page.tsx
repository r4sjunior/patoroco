"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { brl, dateTime, statusLabel, type Fulfillment, type OrderStatus } from "@/lib/format";
import { storage } from "../cart";

interface Row {
  token: string;
  id: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  totalCents: number;
  createdAt: string;
}

export default function MeusPedidos() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const tokens = storage.read<{ token: string }[]>("pr_pedidos", []).map((o) => o.token);
    if (tokens.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a lista só existe no navegador
      setRows([]);
      return;
    }
    fetch("/api/meus-pedidos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tokens }) })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setRows)
      .catch(() => setFailed(true));
  }, []);

  return (
    <main className="page">
      <Link href="/" className="back">
        <ArrowLeft size={18} aria-hidden /> Voltar ao cardápio
      </Link>
      <h1 className="page-title">Meus pedidos</h1>
      {failed && <p className="form-err">Não foi possível carregar seus pedidos. Tente de novo.</p>}
      {!failed && rows === null && <p className="empty">Carregando…</p>}
      {rows?.length === 0 && (
        <>
          <p className="empty">Os pedidos feitos neste aparelho aparecem aqui.</p>
          <Link href="/" className="btn-primary">
            Fazer um pedido
          </Link>
        </>
      )}
      {rows && rows.length > 0 && (
        <ul className="my-orders">
          {rows.map((o) => (
            <li key={o.token}>
              <Link href={`/pedido/${o.token}`}>
                <span>
                  <strong>Pedido #{o.id}</strong>
                  <span className="muted">{dateTime(o.createdAt)}</span>
                </span>
                <span className="my-right">
                  <span className={`badge st-${o.status}`}>{statusLabel(o.status, o.fulfillment)}</span>
                  <strong>{brl(o.totalCents)}</strong>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
