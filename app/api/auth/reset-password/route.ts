import { NextResponse } from "next/server";
import { resetPassword } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: string; password?: string };
    if (!body.token || !body.password || body.password.length < 8) {
      return NextResponse.json(
        { error: "Token y contraseña de al menos 8 caracteres son obligatorios." },
        { status: 400 },
      );
    }
    const ok = await resetPassword(body.token, body.password);
    if (!ok) return NextResponse.json({ error: "Token inválido o expirado." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/reset-password]", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}
