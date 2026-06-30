import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { syncCurrentUserGoogleCalendar } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();
    const googleSync = await syncCurrentUserGoogleCalendar(user.id);
    return NextResponse.json({ ok: true, googleSync });
  } catch (err) {
    console.error("[api/google/sync]", err);
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
