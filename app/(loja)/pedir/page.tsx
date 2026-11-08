import type { Metadata } from "next";
import { getSettings, listProducts, listZones } from "@/lib/catalog";
import { Checkout } from "./checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finalizar pedido | Pato Roco" };

export default async function PedirPage() {
  const [settings, products, zones] = await Promise.all([getSettings(), listProducts(), listZones()]);
  return (
    <Checkout
      storeOpen={settings.storeOpen}
      whatsapp={settings.whatsapp}
      pickupAddress={settings.address}
      zones={zones}
      products={products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, available: p.available }))}
    />
  );
}
