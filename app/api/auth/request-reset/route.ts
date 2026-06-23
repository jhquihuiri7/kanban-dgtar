import { NextResponse } from "next/server";
import { createPasswordReset } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    if (!body.email) {
      return NextResponse.json({ error: "El email es obligatorio." }, { status: 400 });
    }
    const token = await createPasswordReset(body.email);
    const resetUrl = token ? `/login?reset=${encodeURIComponent(token)}` : null;
    if (resetUrl) console.info(`[auth] Enlace de recuperacion para ${body.email}: ${resetUrl}`);
    return NextResponse.json({
      ok: true,
      resetUrl,
      message: "Si el email existe, se generó un enlace de recuperación.",
    });
  } catch (err) {
    console.error("[api/auth/request-reset]", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}
