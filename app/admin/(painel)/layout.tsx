import type { ReactNode } from "react";
import { getOpenSession } from "@/lib/cash";
import { getSettings } from "@/lib/catalog";
import { pulse } from "@/lib/orders";
import { requireAdmin } from "../auth";
import { AdminNav } from "./nav";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const [p, settings, session] = await Promise.all([pulse(), getSettings(), getOpenSession()]);
  return (
    <div className="shell">
      <AdminNav initial={p} storeOpen={settings.storeOpen} cashOpen={Boolean(session)} />
      <main className="content">{children}</main>
    </div>
  );
}
