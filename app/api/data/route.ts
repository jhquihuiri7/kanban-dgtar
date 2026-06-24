// REST endpoint backing the Kanban board with PostgreSQL.
//   GET  /api/data  → { funcionarios, competencias, actividades }
//   PUT  /api/data  → overwrite all three tables with the posted document
//
// node-postgres needs the Node runtime (not Edge); never cache the responses.

import { NextResponse } from "next/server";
import { readAll, writeAll, type DbData } from "@/lib/db";
import { requireUser } from "@/lib/auth-server";
import {
  TODAY_ISO,
  actividadFuncionarioIds,
  actividadIncludesFuncionario,
  addDays,
  iso,
  type Actividad,
} from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const data = await readAll();
    return NextResponse.json(filterForUser(data, user));
  } catch (err) {
    console.error("[api/data] GET", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: statusForError(err) });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Partial<DbData>;
    if (!body || !Array.isArray(body.funcionarios) || !Array.isArray(body.competencias) || !Array.isArray(body.actividades)) {
      return NextResponse.json(
        { error: "Cuerpo inválido: se esperan funcionarios, competencias y actividades." },
        { status: 400 },
      );
    }
    if (user.role === "admin") {
      await writeAll({
        funcionarios: body.funcionarios,
        competencias: body.competencias,
        actividades: body.actividades,
      });
    } else {
      const current = await readAll();
      await writeAll(mergeUserWrite(current, body.actividades, user.funcionarioId));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/data] PUT", err);
    return NextResponse.json({ error: errorMessage(err) }, { status: statusForError(err) });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}

function statusForError(err: unknown): number {
  const message = errorMessage(err);
  if (message === "No autenticado") return 401;
  if (message === "No autorizado") return 403;
  return 500;
}

function filterForUser(data: DbData, user: { role: string; funcionarioId: string | null }): DbData {
  if (user.role === "admin") return data;
  const actividades = data.actividades.filter((a) => actividadIncludesFuncionario(a, user.funcionarioId));
  const funcionarioIds = new Set<string>();
  if (user.funcionarioId) funcionarioIds.add(user.funcionarioId);
  for (const actividad of actividades) {
    for (const id of actividadFuncionarioIds(actividad)) funcionarioIds.add(id);
  }
  return {
    funcionarios: data.funcionarios.filter((f) => funcionarioIds.has(f.id)),
    competencias: data.competencias,
    actividades,
  };
}

function mergeUserWrite(current: DbData, posted: Actividad[], funcionarioId: string | null): DbData {
  if (!funcionarioId) throw new Error("Tu usuario no está vinculado a un funcionario.");

  const currentById = new Map(current.actividades.map((a) => [a.id, a]));
  const postedById = new Map(posted.map((a) => [a.id, a]));
  const competenciaIds = new Set(current.competencias.map((c) => c.id));

  const nextExistingOwn = current.actividades
    .filter((a) => actividadIncludesFuncionario(a, funcionarioId))
    .map((activity) => {
      const draft = postedById.get(activity.id);
      return draft ? applyUserTextPatch(activity, draft) : activity;
    });

  const maxOrden = current.actividades.reduce((max, a) => Math.max(max, a.orden || 0), 0);
  let nextOrden = maxOrden + 1;
  const newOwn = posted
    .filter((activity) => !currentById.has(activity.id))
    .map((activity) => {
      const competenciaId = competenciaIds.has(activity.competenciaId)
        ? activity.competenciaId
        : current.competencias[0]?.id;
      if (!competenciaId) throw new Error("No existe una competencia válida para crear la actividad.");
      return sanitizeNewUserActivity(activity, funcionarioId, competenciaId, nextOrden++);
    });

  return {
    funcionarios: current.funcionarios,
    competencias: current.competencias,
    actividades: [
      ...current.actividades.filter((a) => !actividadIncludesFuncionario(a, funcionarioId)),
      ...nextExistingOwn,
      ...newOwn,
    ],
  };
}

function applyUserTextPatch(current: Actividad, draft: Actividad): Actividad {
  return {
    ...current,
    titulo: cleanText(draft.titulo) || current.titulo,
    descripcion: cleanText(draft.descripcion),
    observaciones: cleanText(draft.observaciones),
    accionesPendientes: cleanText(draft.accionesPendientes),
    resultadosAlcanzados: cleanText(draft.resultadosAlcanzados),
  };
}

function sanitizeNewUserActivity(
  draft: Actividad,
  funcionarioId: string,
  competenciaId: string,
  orden: number,
): Actividad {
  const titulo = cleanText(draft.titulo) || "Nueva actividad";
  return {
    id: draft.id,
    tipo: "asignacion",
    titulo,
    descripcion: cleanText(draft.descripcion),
    funcionarioId,
    participantesIds: [],
    competenciaId,
    estado: "pendiente",
    fechaCreacion: TODAY_ISO,
    plazoDias: 7,
    fechaVencimiento: iso(addDays(TODAY_ISO, 7)),
    fechaCumplimiento: null,
    observaciones: cleanText(draft.observaciones),
    accionesPendientes: cleanText(draft.accionesPendientes),
    resultadosAlcanzados: cleanText(draft.resultadosAlcanzados),
    orden,
  };
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
