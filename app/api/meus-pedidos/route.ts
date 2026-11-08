import { NextResponse } from "next/server";
import { ordersStatusByTokens } from "@/lib/orders";

// Só devolve pedidos cujo token (secreto, 128 bits) o próprio aparelho já guardou.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const tokens: string[] = Array.isArray(body?.tokens)
    ? body.tokens.filter((t: unknown) => typeof t === "string" && /^[a-f0-9]{32}$/.test(t)).slice(0, 20)
    : [];
  if (tokens.length === 0) return NextResponse.json([]);
  return NextResponse.json(await ordersStatusByTokens(tokens));
}
