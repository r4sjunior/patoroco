import { NextResponse, type NextRequest } from "next/server";
import { dateTime, localDay, PAYMENT_LABEL } from "@/lib/format";
import { salesRows } from "@/lib/reports";
import { isAdmin } from "../../auth";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function cell(value: string | number): string {
  let s = String(value ?? "");
  // Nome digitado pelo cliente não pode virar fórmula ao abrir no Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const de = req.nextUrl.searchParams.get("de") ?? "";
  const ate = req.nextUrl.searchParams.get("ate") ?? "";
  const from = DAY.test(de) ? de : localDay();
  const to = DAY.test(ate) ? ate : from;

  const rows = await salesRows(from, to);
  const header = ["Pedido", "Recebido em", "Canal", "Cliente", "Telefone", "Itens", "Pagamento", "Subtotal", "Desconto", "Entrega", "Total"];
  const lines = rows.map((r) =>
    [
      r.id,
      dateTime(r.paidAt),
      r.channel === "balcao" ? "Balcão" : "App",
      r.customerName,
      r.customerPhone,
      r.items,
      PAYMENT_LABEL[r.paymentMethod],
      money(r.subtotalCents),
      money(r.discountCents),
      money(r.deliveryFeeCents),
      money(r.totalCents),
    ]
      .map(cell)
      .join(";"),
  );
  // Ponto e vírgula e BOM: é o que o Excel em português abre certo com um clique.
  const csv = `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="vendas-${from}-a-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
