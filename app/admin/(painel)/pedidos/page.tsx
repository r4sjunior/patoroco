import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { brl, localDay, PAYMENT_LABEL, statusLabel, time } from "@/lib/format";
import { listActiveOrders, listFinishedOnDay } from "@/lib/orders";
import { cancelOrderAction } from "../../actions";
import { OrderCard } from "../order-card";

export const metadata: Metadata = { title: "Pedidos" };

const COLUMNS = [
  { status: "novo", title: "Novos", empty: "Nenhum pedido novo." },
  { status: "preparando", title: "Em preparo", empty: "Nada no fogo." },
  { status: "pronto", title: "Prontos / na rua", empty: "Nada aguardando." },
] as const;

export default async function PedidosPage() {
  const [active, finished] = await Promise.all([listActiveOrders(), listFinishedOnDay(localDay())]);
  return (
    <>
      <AutoRefresh seconds={20} />
      <div className="page-head">
        <h1>Pedidos</h1>
      </div>
      <div className="board">
        {COLUMNS.map((c) => {
          const orders = active.filter((o) => o.status === c.status);
          return (
            <section key={c.status} className="board-col" aria-label={c.title}>
              <h2>
                {c.title} <span className="count">{orders.length}</span>
              </h2>
              {orders.length === 0 ? <p className="col-empty">{c.empty}</p> : orders.map((o) => <OrderCard key={o.id} order={o} />)}
            </section>
          );
        })}
      </div>

      <section className="card">
        <h2>Encerrados hoje</h2>
        {finished.length === 0 ? (
          <p className="muted">Nenhum pedido encerrado hoje.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th className="hide-sm">Hora</th>
                  <th>Cliente</th>
                  <th className="hide-sm">Pagamento</th>
                  <th>Situação</th>
                  <th className="num">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {finished.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td className="hide-sm">{time(o.createdAt)}</td>
                    <td>{o.customerName || (o.channel === "balcao" ? "Balcão" : "—")}</td>
                    <td className="hide-sm">{PAYMENT_LABEL[o.paymentMethod]}</td>
                    <td>
                      <span className={o.status === "cancelado" ? "badge badge-bad" : "badge badge-ok"}>{statusLabel(o.status, o.fulfillment)}</span>
                    </td>
                    <td className="num">{brl(o.totalCents)}</td>
                    <td className="num">
                      {o.status === "concluido" && (
                        <ActionForm action={cancelOrderAction} confirm={`Estornar a venda #${o.id}? O valor sai do caixa aberto e o estoque volta.`}>
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="reason" value="Venda estornada" />
                          <button className="link-danger">Estornar</button>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
