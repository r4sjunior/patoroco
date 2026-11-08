"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/lib/format";

/** Formulário ligado a uma Server Action: mostra o erro no lugar e bloqueia o duplo clique. */
export function ActionForm({
  action,
  children,
  className,
  confirm: confirmText,
  resetOnSuccess,
  onSuccess,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const fd = new FormData(e.currentTarget, submitter);
        const message = submitter?.dataset.confirm ?? confirmText;
        if (message && !window.confirm(message)) return;
        setError(null);
        start(async () => {
          try {
            const result = await action(fd);
            if ("error" in result) {
              setError(result.error);
            } else {
              if (resetOnSuccess) ref.current?.reset();
              onSuccess?.();
            }
          } catch {
            setError("Não foi possível concluir. Verifique a conexão e tente de novo.");
          }
        });
      }}
    >
      <fieldset disabled={pending} className="af-fieldset">
        {children}
      </fieldset>
      {error && (
        <p className="form-err" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
