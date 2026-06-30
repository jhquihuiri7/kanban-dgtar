import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getGoogleConnectionStatus } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const status = await getGoogleConnectionStatus(user.id);
    return NextResponse.json(status);
  } catch (err) {
    console.error("[api/google/status]", err);
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
