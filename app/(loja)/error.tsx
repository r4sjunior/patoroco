"use client";

export default function LojaError({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <h1 className="page-title">Ops, algo deu errado</h1>
      <p className="empty">Não conseguimos carregar agora. Se preferir, peça pelo WhatsApp (84) 98183-2604.</p>
      <button type="button" className="btn-primary" onClick={reset}>
        Tentar de novo
      </button>
    </main>
  );
}
