import type { Metadata } from "next";
import Link from "next/link";
import { getOpenSession } from "@/lib/cash";
import { listProducts } from "@/lib/catalog";
import { Pos } from "./pos";

export const metadata: Metadata = { title: "Balcão" };

export default async function BalcaoPage() {
  const [products, session] = await Promise.all([listProducts(), getOpenSession()]);
  return (
    <>
      <div className="page-head">
        <h1>Venda no balcão</h1>
      </div>
      {!session && (
        <div className="alert">
          <span>Abra o caixa para registrar vendas no balcão.</span>
          <Link href="/admin/caixa" className="btn btn-primary">
            Abrir caixa
          </Link>
        </div>
      )}
      <Pos cashOpen={Boolean(session)} products={products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, available: p.available }))} />
    </>
  );
}
