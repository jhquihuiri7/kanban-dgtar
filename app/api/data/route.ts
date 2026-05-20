// REST endpoint backing the Kanban board with PostgreSQL.
//   GET  /api/data  → { funcionarios, competencias, actividades }
//   PUT  /api/data  → overwrite all three tables with the posted document
//
// node-postgres needs the Node runtime (not Edge); never cache the responses.

import { NextResponse } from "next/server";
import { readAll, writeAll, type DbData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readAll();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/data] GET", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<DbData>;
    if (!body || !Array.isArray(body.funcionarios) || !Array.isArray(body.competencias) || !Array.isArray(body.actividades)) {
      return NextResponse.json(
        { error: "Cuerpo inválido: se esperan funcionarios, competencias y actividades." },
        { status: 400 },
      );
    }
    await writeAll({
      funcionarios: body.funcionarios,
      competencias: body.competencias,
      actividades: body.actividades,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/data] PUT", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}
