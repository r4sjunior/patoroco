"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function CopyPix({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pix-box">
      <code>{value}</code>
      <button
        type="button"
        className="btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copie a chave Pix:", value);
          }
        }}
      >
        <Copy size={18} aria-hidden /> {copied ? "Copiada!" : "Copiar"}
      </button>
    </div>
  );
}
