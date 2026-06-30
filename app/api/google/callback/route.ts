import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { connectGoogleAccount } from "@/lib/google-calendar";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  try {
    const user = await requireUser();
    if (oauthError) throw new Error(`Google rechazo la vinculacion: ${oauthError}`);
    if (!code || !state) throw new Error("Callback de Google incompleto.");

    await connectGoogleAccount(req, user.id, code, state);
    return NextResponse.redirect(publicUrl(req, "/?google=connected"));
  } catch (err) {
    console.error("[api/google/callback]", err);
    const redirect = publicUrl(req, "/?google=error");
    redirect.searchParams.set("message", errorMessage(err));
    return NextResponse.redirect(redirect);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}
