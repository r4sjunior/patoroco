import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { dateTime, qty } from "@/lib/format";
import { listStock, recentMovements } from "@/lib/stock";
import { moveStockAction, saveStockItemAction } from "../../actions";

export const metadata: Metadata = { title: "Estoque" };

const TYPE_LABEL = { entrada: "Entrada", saida: "Saída", ajuste: "Contagem", venda: "Venda", estorno: "Devolução" } as const;

export default async function EstoquePage() {
  const [items, moves] = await Promise.all([listStock(true), recentMovements(30)]);
  return (
    <>
      <div className="page-head">
        <h1>Estoque</h1>
      </div>
      <p className="muted page-sub">Cada venda baixa o estoque sozinha, conforme o que está ligado ao produto no Cardápio. Pedido cancelado devolve.</p>

      <div className="stock-list">
        {items.map((i) => {
          const state = i.quantity === 0 ? "bad" : i.quantity <= i.minQuantity ? "warn" : "ok";
          return (
            <article key={i.id} className={i.active ? "stock" : "stock stock-off"}>
              <div className="stock-top">
                <div>
                  <h2>{i.name}</h2>
                  <small className="muted">Mínimo: {qty(i.minQuantity)} {i.unit}{!i.active && " · inativo"}</small>
                </div>
                <div className="stock-qty">
                  <strong>{qty(i.quantity)}</strong> <span>{i.unit}</span>
                  {state !== "ok" && <span className={`badge badge-${state}`}>{state === "bad" ? "Zerado" : "Baixo"}</span>}
                </div>
              </div>
              <ActionForm action={moveStockAction} className="row-form" resetOnSuccess>
                <input type="hidden" name="id" value={i.id} />
                <select name="type" aria-label={`Tipo de lançamento de ${i.name}`} defaultValue="entrada">
                  <option value="entrada">Entrada (+)</option>
                  <option value="saida">Saída (−)</option>
                  <option value="ajuste">Contagem (=)</option>
                </select>
                <input name="amount" required inputMode="decimal" placeholder="Qtd." aria-label="Quantidade" className="input-qty" />
                <input name="note" placeholder="Observação" maxLength={200} aria-label="Observação" />
                <button className="btn btn-primary">Lançar</button>
              </ActionForm>
              <details>
                <summary>Editar item</summary>
                <ActionForm action={saveStockItemAction} className="row-form">
                  <input type="hidden" name="id" value={i.id} />
                  <input name="name" defaultValue={i.name} required aria-label="Nome" />
                  <input name="unit" defaultValue={i.unit} aria-label="Unidade" className="input-qty" />
                  <input name="min" defaultValue={String(i.minQuantity).replace(".", ",")} inputMode="decimal" aria-label="Estoque mínimo" className="input-qty" />
                  <label className="check">
                    <input type="checkbox" name="active" defaultChecked={i.active} /> Ativo
                  </label>
                  <button className="btn">Salvar</button>
                </ActionForm>
              </details>
            </article>
          );
        })}
      </div>

      <section className="card">
        <h2>Novo item de estoque</h2>
        <ActionForm action={saveStockItemAction} className="grid-form" resetOnSuccess>
          <label className="field">
            Nome
            <input name="name" required maxLength={80} placeholder="Ex.: Refrigerante lata" />
          </label>
          <label className="field">
            Unidade
            <input name="unit" defaultValue="un" maxLength={12} />
          </label>
          <label className="field">
            Saldo inicial
            <input name="quantity" inputMode="decimal" placeholder="0" />
          </label>
          <label className="field">
            Mínimo
            <input name="min" inputMode="decimal" placeholder="0" />
          </label>
          <button className="btn btn-primary">Adicionar</button>
        </ActionForm>
      </section>

      <section className="card">
        <h2>Últimas movimentações</h2>
        {moves.length === 0 ? (
          <p className="muted">Nenhuma movimentação ainda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Saldo</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td>{dateTime(m.createdAt)}</td>
                    <td>{m.itemName}</td>
                    <td>{TYPE_LABEL[m.type]}</td>
                    <td className="num">
                      {m.delta > 0 ? "+" : ""}
                      {qty(m.delta)}
                    </td>
                    <td className="num">{qty(m.balanceAfter)}</td>
                    <td>{m.orderId ? `Pedido #${m.orderId}` : m.note}</td>
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
