import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { getOpenSession, listClosedSessions, listEntries, summarize } from "@/lib/cash";
import { brl, dateTime, PAYMENT_LABEL, time } from "@/lib/format";
import { cashEntryAction, closeCashAction, openCashAction } from "../../actions";

export const metadata: Metadata = { title: "Caixa" };

const TYPE_LABEL = { venda: "Venda", suprimento: "Suprimento", sangria: "Sangria", despesa: "Despesa", estorno: "Estorno" } as const;

export default async function CaixaPage() {
  const [session, closed] = await Promise.all([getOpenSession(), listClosedSessions(10)]);
  const entries = session ? await listEntries(session.id) : [];
  const s = session ? summarize(session.openingCents, entries) : null;

  return (
    <>
      <div className="page-head">
        <h1>Caixa</h1>
        {session && <span className="pill pill-ok">Aberto desde {dateTime(session.openedAt)}</span>}
      </div>

      {!session || !s ? (
        <section className="card card-narrow">
          <h2>Abrir o caixa</h2>
          <p className="muted">Informe quanto em dinheiro tem na gaveta para começar.</p>
          <ActionForm action={openCashAction} className="row-form">
            <input name="opening" inputMode="decimal" placeholder="0,00" aria-label="Valor de abertura em reais" />
            <button className="btn btn-primary">Abrir caixa</button>
          </ActionForm>
        </section>
      ) : (
        <>
          <section className="tiles" aria-label="Resumo do caixa">
            <div className="tile tile-hero">
              <span>Dinheiro na gaveta</span>
              <strong>{brl(s.expectedDrawer)}</strong>
              <small>Valor esperado agora</small>
            </div>
            <div className="tile">
              <span>Vendido no caixa</span>
              <strong>{brl(s.salesTotal)}</strong>
              <small>Todas as formas, menos estornos</small>
            </div>
            <div className="tile">
              <span>Pix</span>
              <strong>{brl(s.salesPix)}</strong>
              <small>Não entra na gaveta</small>
            </div>
            <div className="tile">
              <span>Cartão</span>
              <strong>{brl(s.salesCard)}</strong>
              <small>Não entra na gaveta</small>
            </div>
          </section>

          <section className="card">
            <h2>Conta da gaveta</h2>
            <dl className="ledger">
              <dt>Abertura</dt>
              <dd>{brl(session.openingCents)}</dd>
              <dt>Vendas em dinheiro</dt>
              <dd>+ {brl(s.salesCash)}</dd>
              <dt>Suprimentos</dt>
              <dd>+ {brl(s.supplies)}</dd>
              <dt>Sangrias</dt>
              <dd>− {brl(-s.withdrawals)}</dd>
              <dt>Despesas</dt>
              <dd>− {brl(-s.expenses)}</dd>
              <dt>Estornos em dinheiro</dt>
              <dd>− {brl(-entries.filter((e) => e.type === "estorno" && e.method === "dinheiro").reduce((n, e) => n + e.amountCents, 0))}</dd>
              <dt className="ledger-total">Deve ter na gaveta</dt>
              <dd className="ledger-total">{brl(s.expectedDrawer)}</dd>
            </dl>
          </section>

          <div className="grid-cards">
            <section className="card">
              <h2>Lançar movimento</h2>
              <ActionForm action={cashEntryAction} className="stack" resetOnSuccess>
                <label className="field">
                  Tipo
                  <select name="type" defaultValue="despesa">
                    <option value="despesa">Despesa (pago da gaveta)</option>
                    <option value="sangria">Sangria (retirada)</option>
                    <option value="suprimento">Suprimento (reforço de troco)</option>
                  </select>
                </label>
                <label className="field">
                  Valor (R$)
                  <input name="amount" required inputMode="decimal" placeholder="0,00" />
                </label>
                <label className="field">
                  Descrição
                  <input name="description" maxLength={200} placeholder="Ex.: Carvão" />
                </label>
                <button className="btn btn-primary">Lançar</button>
              </ActionForm>
            </section>

            <section className="card">
              <h2>Fechar o caixa</h2>
              <p className="muted">Conte o dinheiro da gaveta. O sistema compara com os {brl(s.expectedDrawer)} esperados.</p>
              <ActionForm action={closeCashAction} className="stack" confirm="Fechar o caixa agora?">
                <label className="field">
                  Dinheiro contado (R$)
                  <input name="counted" required inputMode="decimal" placeholder="0,00" />
                </label>
                <label className="field">
                  Observação
                  <input name="notes" maxLength={300} />
                </label>
                <button className="btn btn-danger">Fechar caixa</button>
              </ActionForm>
            </section>
          </div>

          <section className="card">
            <h2>Lançamentos deste caixa</h2>
            {entries.length === 0 ? (
              <p className="muted">Nenhum lançamento ainda.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Tipo</th>
                      <th>Descrição</th>
                      <th>Forma</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td>{time(e.createdAt)}</td>
                        <td>{TYPE_LABEL[e.type]}</td>
                        <td>{e.description}</td>
                        <td>{PAYMENT_LABEL[e.method]}</td>
                        <td className={e.amountCents < 0 ? "num neg" : "num"}>{e.amountCents < 0 ? `− ${brl(-e.amountCents)}` : brl(e.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="card">
        <h2>Caixas anteriores</h2>
        {closed.length === 0 ? (
          <p className="muted">Nenhum caixa fechado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="hide-sm">Abertura</th>
                  <th>Fechamento</th>
                  <th className="num hide-sm">Esperado</th>
                  <th className="num">Contado</th>
                  <th className="num">Diferença</th>
                  <th className="hide-sm">Observação</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((c) => {
                  const diff = (c.countedCents ?? 0) - (c.expectedCents ?? 0);
                  return (
                    <tr key={c.id}>
                      <td className="hide-sm">{dateTime(c.openedAt)}</td>
                      <td>{c.closedAt ? dateTime(c.closedAt) : ""}</td>
                      <td className="num hide-sm">{brl(c.expectedCents ?? 0)}</td>
                      <td className="num">{brl(c.countedCents ?? 0)}</td>
                      <td className="num">
                        <span className={diff === 0 ? "badge badge-ok" : "badge badge-bad"}>
                          {diff === 0 ? "Bateu" : diff > 0 ? `Sobrou ${brl(diff)}` : `Faltou ${brl(-diff)}`}
                        </span>
                      </td>
                      <td className="hide-sm">{c.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
