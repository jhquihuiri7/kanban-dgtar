import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { createGoogleAuthUrl } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = await createGoogleAuthUrl(req, user.id);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[api/google/connect]", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: statusForError(err) });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}

function statusForError(err: unknown): number {
  const message = errorMessage(err);
  if (message === "No autenticado") return 401;
  return 500;
}
