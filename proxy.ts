import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Barreira de entrada do sistema do admin. Cada página e action confere a sessão de novo.
export function proxy(req: NextRequest) {
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = {
  matcher: ["/admin", "/admin/((?!login(?:/|$)).*)"],
};
