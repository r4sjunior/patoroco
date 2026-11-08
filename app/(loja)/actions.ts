"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/catalog";
import { UserError } from "@/lib/format";
import { placeOnlineOrder } from "@/lib/orders";

export async function placeOrderAction(input: unknown): Promise<{ token: string; id: number } | { error: string }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    // Cada pedido reserva estoque: limita quem tentar esvaziar a loja com pedidos falsos.
    if (!(await rateLimit(`pedido:${ip}`, 8, 600))) {
      return { error: "Muitos pedidos em pouco tempo. Aguarde alguns minutos ou chame no WhatsApp." };
    }
    const order = await placeOnlineOrder(input);
    revalidatePath("/");
    return order;
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("Falha ao criar pedido", err);
    return { error: "Não foi possível enviar seu pedido. Tente de novo ou chame no WhatsApp." };
  }
}
