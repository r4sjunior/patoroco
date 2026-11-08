import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <h1 className="page-title">Essa página não existe</h1>
      <p className="empty">Mas o frango continua assando.</p>
      <Link href="/" className="btn-primary">
        Ver o cardápio
      </Link>
    </main>
  );
}
