"use client";

export default function PainelError({ reset }: { reset: () => void }) {
  return (
    <section className="card card-narrow">
      <h1>Não foi possível carregar esta tela</h1>
      <p className="muted">Verifique a conexão. Se continuar, confira se o banco de dados está conectado.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Tentar de novo
      </button>
    </section>
  );
}
