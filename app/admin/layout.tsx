import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";
import "./admin.css";

const sans = Archivo({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "Pato Roco Gestão", template: "%s | Pato Roco Gestão" },
  manifest: "/admin.webmanifest",
  icons: { icon: "/icons/admin-192.png", apple: "/icons/apple-admin.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1c1917", width: "device-width", initialScale: 1 };

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
