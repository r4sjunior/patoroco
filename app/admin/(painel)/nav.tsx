"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, ClipboardList, Drumstick, LayoutDashboard, LogOut, MoreHorizontal, Package, Settings, ShoppingCart, Wallet, type LucideIcon } from "lucide-react";
import { logoutAction } from "../actions";

const LINKS: { href: string; label: string; icon: LucideIcon; main?: boolean }[] = [
  { href: "/admin", label: "Painel", icon: LayoutDashboard, main: true },
  { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, main: true },
  { href: "/admin/balcao", label: "Balcão", icon: ShoppingCart, main: true },
  { href: "/admin/caixa", label: "Caixa", icon: Wallet, main: true },
  { href: "/admin/estoque", label: "Estoque", icon: Package },
  { href: "/admin/vendas", label: "Vendas", icon: BarChart3 },
  { href: "/admin/cardapio", label: "Cardápio", icon: Drumstick },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings },
];

function beep() {
  try {
    const Ctx = window.AudioContext;
    const ctx = new Ctx();
    [0, 0.22, 0.44].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.2);
    });
  } catch {
    // Sem áudio liberado no navegador: o contador na tela continua avisando.
  }
}

export function AdminNav({
  initial,
  storeOpen,
  cashOpen,
}: {
  initial: { newCount: number; lastId: number };
  storeOpen: boolean;
  cashOpen: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [newCount, setNewCount] = useState(initial.newCount);
  const [more, setMore] = useState(false);
  const lastId = useRef(initial.lastId);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o servidor pode trazer um valor mais novo a cada navegação
    setNewCount(initial.newCount);
    lastId.current = Math.max(lastId.current, initial.lastId);
  }, [initial.newCount, initial.lastId]);

  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/admin/api/pulse", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        if (!res.ok) return;
        const data: { newCount: number; lastId: number } = await res.json();
        setNewCount(data.newCount);
        if (data.lastId > lastId.current) {
          lastId.current = data.lastId;
          beep();
          router.refresh();
        }
      } catch {
        // Sem internet agora: tenta de novo no próximo ciclo.
      }
    };
    const timer = setInterval(check, 15_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router]);

  useEffect(() => {
    // O Next regrava o título ao atualizar a tela: observa para manter o contador na aba.
    const apply = () => {
      const base = document.title.replace(/^\(\d+\) /, "");
      const next = newCount > 0 ? `(${newCount}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [newCount]);

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const item = (l: (typeof LINKS)[number]) => (
    <Link key={l.href} href={l.href} className={isActive(l.href) ? "nav-link on" : "nav-link"} aria-current={isActive(l.href) ? "page" : undefined} onClick={() => setMore(false)}>
      <l.icon size={20} aria-hidden />
      <span>{l.label}</span>
      {l.href === "/admin/pedidos" && newCount > 0 && <b className="nav-badge" aria-label={`${newCount} novos`}>{newCount}</b>}
    </Link>
  );

  return (
    <>
      {/* Computador: barra lateral */}
      <aside className="side">
        <div className="side-brand">
          <Image src="/img/mascote.png" alt="" width={40} height={40} />
          <div>
            <strong>Pato Roco</strong>
            <span>Gestão</span>
          </div>
        </div>
        <div className="side-state">
          <span className={storeOpen ? "pill pill-ok" : "pill pill-off"}>Loja {storeOpen ? "aberta" : "fechada"}</span>
          <span className={cashOpen ? "pill pill-ok" : "pill pill-off"}>Caixa {cashOpen ? "aberto" : "fechado"}</span>
        </div>
        <nav className="side-links" aria-label="Menu">
          {LINKS.map(item)}
        </nav>
        <form action={logoutAction}>
          <button className="nav-link nav-exit">
            <LogOut size={20} aria-hidden />
            <span>Sair</span>
          </button>
        </form>
      </aside>

      {/* Celular: barra inferior, feita para o polegar */}
      <nav className="bottom" aria-label="Menu">
        {LINKS.filter((l) => l.main).map(item)}
        <button type="button" className={more ? "nav-link on" : "nav-link"} aria-expanded={more} onClick={() => setMore(!more)}>
          <MoreHorizontal size={20} aria-hidden />
          <span>Mais</span>
        </button>
      </nav>
      {more && (
        <div className="more-sheet">
          {LINKS.filter((l) => !l.main).map(item)}
          <form action={logoutAction}>
            <button className="nav-link nav-exit">
              <LogOut size={20} aria-hidden />
              <span>Sair</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
