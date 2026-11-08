import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { authConfigured } from "@/lib/session";
import { loginAction } from "../actions";
import { isAdmin } from "../auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <main className="login">
      <div className="login-card">
        <Image src="/img/mascote.png" alt="" width={64} height={64} className="login-logo" />
        <h1>Pato Roco Gestão</h1>
        <p className="muted">Área restrita à administração.</p>
        {!authConfigured() && <p className="form-err">Sistema sem senha configurada. Defina ADMIN_PASSWORD e AUTH_SECRET.</p>}
        <ActionForm action={loginAction} className="stack">
          <label className="field">
            Senha
            <input type="password" name="password" required autoFocus autoComplete="current-password" />
          </label>
          <button className="btn btn-primary btn-block">Entrar</button>
        </ActionForm>
      </div>
    </main>
  );
}
