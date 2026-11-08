import { NextResponse } from "next/server";
import { pulse } from "@/lib/orders";
import { isAdmin } from "../../auth";

// Consulta leve que avisa o painel quando chega pedido novo.
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await pulse(), { headers: { "cache-control": "no-store" } });
}
