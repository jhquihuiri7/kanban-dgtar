import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { updateGoogleSyncPreferences } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => null)) as {
      syncReuniones?: unknown;
      syncAsignaciones?: unknown;
    } | null;
    if (typeof body?.syncReuniones !== "boolean" || typeof body?.syncAsignaciones !== "boolean") {
      return NextResponse.json({ error: "Preferencias invalidas." }, { status: 400 });
    }
    const status = await updateGoogleSyncPreferences(user.id, {
      syncReuniones: body.syncReuniones,
      syncAsignaciones: body.syncAsignaciones,
    });
    return NextResponse.json(status);
  } catch (err) {
    console.error("[api/google/preferences]", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: statusForError(err) });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}

function statusForError(err: unknown): number {
  const message = errorMessage(err);
  if (message === "No autenticado") return 401;
  if (message.startsWith("Selecciona al menos")) return 400;
  return 500;
}
