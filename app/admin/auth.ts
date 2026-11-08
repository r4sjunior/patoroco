import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { passwordVersion } from "@/lib/password";
import { readSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const session = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return false;
  // Sessão aberta antes de trocar a senha não vale mais.
  return session.version === (await passwordVersion());
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
