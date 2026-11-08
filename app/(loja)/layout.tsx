import type { Metadata, Viewport } from "next";
import { Lilita_One, Nunito_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { CartProvider } from "./cart";
import "./loja.css";

const display = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Nunito_Sans({ subsets: ["latin"], variable: "--font-body" });

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Frango Assado do Pato Roco | Peça agora",
  description: "Sabor que dá água na boca! Frango assado com macaxeira e farofa em Extremoz. Entrega grátis no Vila Maria.",
  manifest: "/loja.webmanifest",
  icons: { icon: "/icons/loja-192.png", apple: "/icons/apple-loja.png" },
  openGraph: {
    title: "Frango Assado do Pato Roco",
    description: "Sabor que dá água na boca! Peça o seu pelo app.",
    images: ["/img/combo.webp"],
    locale: "pt_BR",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#b80f0b", width: "device-width", initialScale: 1 };

export default function LojaLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
