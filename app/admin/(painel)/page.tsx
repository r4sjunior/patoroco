import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { getOpenSession, listEntries, summarize } from "@/lib/cash";
import { getSettings } from "@/lib/catalog";
import { brl, localDay, qty } from "@/lib/format";
import { listActiveOrders } from "@/lib/orders";
import { salesReport } from "@/lib/reports";
import { lowStock } from "@/lib/stock";
import { setStoreOpenAction } from "../actions";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const today = localDay();
  const [report, active, low, session, settings] = await Promise.all([salesReport(today, today), listActiveOrders(), lowStock(), getOpenSession(), getSettings()]);
  const drawer = session ? summarize(session.openingCents, await listEntries(session.id)).expectedDrawer : null;
  const counts = { novo: 0, preparando: 0, pronto: 0 } as Record<string, number>;
  active.forEach((o) => (counts[o.status] += 1));

  return (
    <>
      <div className="page-head">
        <h1>Painel de hoje</h1>
        <ActionForm action={setStoreOpenAction}>
          <input type="hidden" name="open" value={settings.storeOpen ? "0" : "1"} />
          <button className={settings.storeOpen ? "btn" : "btn btn-ok"}>{settings.storeOpen ? "Fechar a loja" : "Abrir a loja"}</button>
        </ActionForm>
      </div>

      {!session && (
        <div className="alert">
          <AlertTriangle size={20} aria-hidden />
          <span>O caixa está fechado. Sem ele não dá para concluir pedidos nem vender no balcão.</span>
          <Link href="/admin/caixa" className="btn btn-primary">
            Abrir caixa
          </Link>
        </div>
      )}

      <section className="tiles" aria-label="Resumo do dia">
        <div className="tile tile-hero">
          <span>Vendas de hoje</span>
          <strong>{brl(report.totalCents)}</strong>
          <small>
            {report.orders} {report.orders === 1 ? "venda" : "vendas"} · {report.units} {report.units === 1 ? "item" : "itens"}
          </small>
        </div>
        <Link href="/admin/pedidos" className="tile">
          <span>Pedidos novos</span>
          <strong>{counts.novo}</strong>
          <small>
            {counts.preparando} em preparo · {counts.pronto} prontos
          </small>
        </Link>
        <Link href="/admin/caixa" className="tile">
          <span>Dinheiro na gaveta</span>
          <strong>{drawer === null ? "Fechado" : brl(drawer)}</strong>
          <small>{drawer === null ? "Caixa não aberto" : "Valor esperado"}</small>
        </Link>
        <div className="tile">
          <span>Ticket médio</span>
          <strong>{report.orders ? brl(Math.round(report.totalCents / report.orders)) : "—"}</strong>
          <small>Valor médio por venda</small>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Estoque baixo</h2>
          <Link href="/admin/estoque">Ver estoque</Link>
        </div>
        {low.length === 0 ? (
          <p className="muted">Tudo acima do mínimo.</p>
        ) : (
          <ul className="low-list">
            {low.map((i) => (
              <li key={i.id}>
                <span>{i.name}</span>
                <span className={i.quantity === 0 ? "badge badge-bad" : "badge badge-warn"}>
                  {i.quantity === 0 ? "Zerado" : `${qty(i.quantity)} ${i.unit}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
