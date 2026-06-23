import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-token";
import { authenticateUser, createLoginToken, sessionCookieOptions } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Email y contraseña son obligatorios." }, { status: 400 });
    }
    const user = await authenticateUser(body.email, body.password);
    if (!user) {
      return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
    }
    const token = await createLoginToken(user);
    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    console.error("[api/auth/login]", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}
