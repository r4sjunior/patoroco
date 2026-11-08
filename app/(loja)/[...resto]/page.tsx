import { notFound } from "next/navigation";

// Sem layout na raiz de app/, é isto que faz URLs desconhecidas usarem o 404 da loja.
export default function Resto() {
  notFound();
}
