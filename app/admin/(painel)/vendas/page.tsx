import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { brl, localDay, PAYMENT_LABEL } from "@/lib/format";
import { salesReport } from "@/lib/reports";

export const metadata: Metadata = { title: "Vendas" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function HBars({ rows }: { rows: { label: string; value: number; detail: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="hbar-text">
            <span>{r.label}</span>
            <span className="num">{brl(r.value)}</span>
          </div>
          <div className="hbar-track">
            <div className="hbar" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <small className="muted">{r.detail}</small>
        </li>
      ))}
    </ul>
  );
}

export default async function VendasPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const today = localDay();
  const presets = [
    { label: "Hoje", de: today, ate: today },
    { label: "7 dias", de: localDay(-6), ate: today },
    { label: "30 dias", de: localDay(-29), ate: today },
  ];
  let from = sp.de && DAY.test(sp.de) ? sp.de : localDay(-6);
  let to = sp.ate && DAY.test(sp.ate) ? sp.ate : today;
  if (from > to) [from, to] = [to, from];
  // Limita o período a pouco mais de um ano para o gráfico continuar legível.
  if (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime() > 370 * 86_400_000) {
    from = localDay(-370, new Date(`${to}T12:00:00Z`));
  }

  const r = await salesReport(from, to);
  const maxDay = Math.max(...r.daily.map((d) => d.totalCents), 1);
  const peak = r.daily.reduce((best, d) => (d.totalCents > best.totalCents ? d : best), r.daily[0]);
  const labelEvery = Math.max(1, Math.ceil(r.daily.length / 7));

  return (
    <>
      <div className="page-head">
        <h1>Vendas</h1>
        <a className="btn" href={`/admin/api/vendas-csv?de=${from}&ate=${to}`}>
          <Download size={18} aria-hidden /> Baixar planilha
        </a>
      </div>

      <div className="filters">
        <div className="seg">
          {presets.map((p) => (
            <Link key={p.label} href={`/admin/vendas?de=${p.de}&ate=${p.ate}`} className={from === p.de && to === p.ate ? "on" : ""} aria-current={from === p.de && to === p.ate ? "true" : undefined}>
              {p.label}
            </Link>
          ))}
        </div>
        <form className="date-form">
          <label>
            De <input type="date" name="de" defaultValue={from} />
          </label>
          <label>
            Até <input type="date" name="ate" defaultValue={to} />
          </label>
          <button className="btn">Ver</button>
        </form>
      </div>

      <section className="tiles" aria-label="Resumo do período">
        <div className="tile tile-hero">
          <span>Faturamento</span>
          <strong>{brl(r.totalCents)}</strong>
          <small>Vendas recebidas no período</small>
        </div>
        <div className="tile">
          <span>Vendas</span>
          <strong>{r.orders}</strong>
          <small>{r.units} itens vendidos</small>
        </div>
        <div className="tile">
          <span>Ticket médio</span>
          <strong>{r.orders ? brl(Math.round(r.totalCents / r.orders)) : "—"}</strong>
          <small>Valor médio por venda</small>
        </div>
        <div className="tile">
          <span>Cancelados</span>
          <strong>{r.canceled}</strong>
          <small>Fora do faturamento</small>
        </div>
      </section>

      {r.orders === 0 ? (
        <section className="card">
          <p className="muted">Nenhuma venda recebida neste período.</p>
        </section>
      ) : (
        <>
          {r.daily.length > 1 && (
            <section className="card">
              <h2>Faturamento por dia</h2>
              <div className="vchart" role="img" aria-label={`Faturamento diário de ${shortDay(from)} a ${shortDay(to)}. Maior dia: ${shortDay(peak.day)}, ${brl(peak.totalCents)}.`}>
                {r.daily.map((d, i) => (
                  <div key={d.day} className="vcol" tabIndex={0}>
                    <div className="vtip">
                      <b>{shortDay(d.day)}</b> {brl(d.totalCents)} · {d.orders} {d.orders === 1 ? "venda" : "vendas"}
                    </div>
                    <div className="vplot">
                      {d.day === peak.day && d.totalCents > 0 && <span className="vpeak">{brl(d.totalCents)}</span>}
                      <div className="vbar" style={{ height: `${(d.totalCents / maxDay) * 100}%` }} />
                    </div>
                    <span className="vlabel">{i % labelEvery === 0 ? shortDay(d.day) : ""}</span>
                  </div>
                ))}
              </div>
              <details>
                <summary>Ver como tabela</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Dia</th>
                        <th className="num">Vendas</th>
                        <th className="num">Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.daily.map((d) => (
                        <tr key={d.day}>
                          <td>{shortDay(d.day)}</td>
                          <td className="num">{d.orders}</td>
                          <td className="num">{brl(d.totalCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          )}
          <div className="grid-cards">
            <section className="card">
              <h2>Por produto</h2>
              <HBars rows={r.byProduct.map((p) => ({ label: p.name, value: p.totalCents, detail: `${p.units} ${p.units === 1 ? "unidade" : "unidades"}, sem desconto nem entrega` }))} />
            </section>
            <section className="card">
              <h2>Por forma de pagamento</h2>
              <HBars rows={r.byMethod.map((m) => ({ label: PAYMENT_LABEL[m.method], value: m.totalCents, detail: `${m.orders} ${m.orders === 1 ? "venda" : "vendas"}` }))} />
            </section>
            <section className="card">
              <h2>Por canal</h2>
              <HBars rows={r.byChannel.map((c) => ({ label: c.channel === "balcao" ? "Balcão" : "App", value: c.totalCents, detail: `${c.orders} ${c.orders === 1 ? "venda" : "vendas"}` }))} />
            </section>
          </div>
        </>
      )}
    </>
  );
}
