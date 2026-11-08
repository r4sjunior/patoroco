import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { listProducts, type Product } from "@/lib/catalog";
import { brl } from "@/lib/format";
import { listStock, type StockItem } from "@/lib/stock";
import { saveProductAction } from "../../actions";

export const metadata: Metadata = { title: "Cardápio" };

const toInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function ProductFields({ product, stock }: { product?: Product; stock: StockItem[] }) {
  return (
    <>
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid-form">
        <label className="field field-wide">
          Nome
          <input name="name" required maxLength={100} defaultValue={product?.name} />
        </label>
        <label className="field">
          Preço (R$)
          <input name="price" required inputMode="decimal" defaultValue={product ? toInput(product.priceCents) : ""} placeholder="0,00" />
        </label>
        <label className="field">
          Ordem
          <input name="sort" type="number" defaultValue={product?.sort ?? 10} />
        </label>
        <label className="field field-wide">
          Descrição
          <input name="description" maxLength={200} defaultValue={product?.description} />
        </label>
      </div>
      <fieldset className="recipe">
        <legend>O que cada unidade vendida baixa do estoque</legend>
        {stock.length === 0 && <p className="muted">Cadastre itens no Estoque primeiro.</p>}
        {stock.map((s) => {
          const line = product?.recipe.find((r) => r.stockItemId === s.id);
          return (
            <label key={s.id} className="recipe-line">
              <span>{s.name}</span>
              <input name={`rec_${s.id}`} inputMode="decimal" placeholder="0" defaultValue={line ? String(line.quantity).replace(".", ",") : ""} className="input-qty" />
              <small className="muted">{s.unit}</small>
            </label>
          );
        })}
      </fieldset>
      <div className="row-form">
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={product?.active ?? true} /> À venda
        </label>
        <label className="check">
          <input type="checkbox" name="highlight" defaultChecked={product?.highlight ?? false} /> Destaque (promoção)
        </label>
        <button className="btn btn-primary">{product ? "Salvar" : "Adicionar produto"}</button>
      </div>
    </>
  );
}

export default async function CardapioPage() {
  const [products, stock] = await Promise.all([listProducts({ includeInactive: true }), listStock()]);
  return (
    <>
      <div className="page-head">
        <h1>Cardápio</h1>
      </div>
      <p className="muted page-sub">O que aparece aqui é o que o cliente vê na loja. Mudou o preço, muda na hora para os novos pedidos.</p>
      <div className="stock-list">
        {products.map((p) => (
          <article key={p.id} className={p.active ? "stock" : "stock stock-off"}>
            <div className="stock-top">
              <div>
                <h2>{p.name}</h2>
                <small className="muted">
                  {!p.active && "Fora de venda · "}
                  {p.highlight && "Destaque · "}
                  {p.available === null ? "Sem controle de estoque" : `Dá para vender ${p.available}${p.limitedBy ? ` (limite: ${p.limitedBy})` : ""}`}
                </small>
              </div>
              <div className="stock-qty">
                <strong>{brl(p.priceCents)}</strong>
              </div>
            </div>
            <details>
              <summary>Editar produto</summary>
              <ActionForm action={saveProductAction} className="stack">
                <ProductFields product={p} stock={stock} />
              </ActionForm>
            </details>
          </article>
        ))}
      </div>
      <section className="card">
        <h2>Novo produto</h2>
        <ActionForm action={saveProductAction} className="stack" resetOnSuccess>
          <ProductFields stock={stock} />
        </ActionForm>
      </section>
    </>
  );
}
