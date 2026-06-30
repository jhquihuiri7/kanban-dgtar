// REST endpoint backing the Kanban board with PostgreSQL.
//   GET  /api/data  → { funcionarios, competencias, actividades }
//   PUT  /api/data  → overwrite all three tables with the posted document
//
// node-postgres needs the Node runtime (not Edge); never cache the responses.

import { NextResponse } from "next/server";
import { readAll, writeAll, type DbData } from "@/lib/db";
import { requireUser } from "@/lib/auth-server";
import { syncGoogleCalendars } from "@/lib/google-calendar";
import {
  ESTADOS,
  TODAY_ISO,
  TIPOS,
  actividadIncludesFuncionario,
  addDays,
  daysBetween,
  iso,
  type Actividad,
  type EstadoActividad,
  type TipoActividad,
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
    const current = await readAll();
    const next: DbData =
      user.role === "admin"
        ? {
            funcionarios: body.funcionarios,
            competencias: body.competencias,
            actividades: body.actividades,
          }
        : mergeUserWrite(current, body.actividades, user.funcionarioId);

    await writeAll(next);
    const googleSync = await syncGoogleCalendars(current, next);
    return NextResponse.json({ ok: true, googleSync });
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
  return {
    funcionarios: data.funcionarios,
    competencias: data.competencias,
    actividades,
  };
}

function mergeUserWrite(current: DbData, posted: Actividad[], funcionarioId: string | null): DbData {
  if (!funcionarioId) throw new Error("Tu usuario no está vinculado a un funcionario.");

  const currentById = new Map(current.actividades.map((a) => [a.id, a]));
  const postedById = new Map(posted.map((a) => [a.id, a]));
  const competenciaIds = new Set(current.competencias.map((c) => c.id));
  const funcionarioIds = new Set(current.funcionarios.map((f) => f.id));

  const nextExistingOwn = current.actividades
    .filter((a) => a.funcionarioId === funcionarioId)
    .flatMap((activity) => {
      const draft = postedById.get(activity.id);
      return draft ? [sanitizeUserActivity(draft, funcionarioId, competenciaIds, funcionarioIds, activity.orden, activity)] : [];
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
      return sanitizeUserActivity(
        { ...activity, competenciaId },
        funcionarioId,
        competenciaIds,
        funcionarioIds,
        nextOrden++,
      );
    });

  return {
    funcionarios: current.funcionarios,
    competencias: current.competencias,
    actividades: [
      ...current.actividades.filter((a) => a.funcionarioId !== funcionarioId),
      ...nextExistingOwn,
      ...newOwn,
    ],
  };
}

function sanitizeUserActivity(
  draft: Actividad,
  funcionarioId: string,
  competenciaIds: Set<string>,
  funcionarioIds: Set<string>,
  orden: number,
  current?: Actividad,
): Actividad {
  const tipo = validTipo(draft.tipo, current?.tipo);
  const estado = validEstado(draft.estado, current?.estado);
  const fechaCreacion = current?.fechaCreacion || TODAY_ISO;
  const titulo = cleanText(draft.titulo) || current?.titulo || "Nueva actividad";
  const competenciaId = competenciaIds.has(draft.competenciaId)
    ? draft.competenciaId
    : current?.competenciaId && competenciaIds.has(current.competenciaId)
      ? current.competenciaId
      : Array.from(competenciaIds)[0];
  if (!competenciaId) throw new Error("No existe una competencia válida para crear la actividad.");

  const plazoDias =
    tipo === "reunion"
      ? daysBetween(fechaCreacion, sanitizeMeetingDateTime(draft.fechaVencimiento))
      : clampDays(draft.plazoDias);
  const fechaVencimiento =
    tipo === "reunion" ? sanitizeMeetingDateTime(draft.fechaVencimiento) : iso(addDays(fechaCreacion, plazoDias));
  const fechaCumplimiento =
    estado === "cumplida" ? cleanDate(draft.fechaCumplimiento) || current?.fechaCumplimiento || TODAY_ISO : null;

  return {
    id: draft.id,
    tipo,
    titulo,
    descripcion: cleanText(draft.descripcion),
    funcionarioId,
    participantesIds:
      tipo === "reunion" ? cleanParticipantes(draft.participantesIds, funcionarioId, funcionarioIds) : [],
    competenciaId,
    estado,
    fechaCreacion,
    plazoDias,
    fechaVencimiento,
    fechaCumplimiento,
    observaciones: cleanText(draft.observaciones),
    accionesPendientes: cleanText(draft.accionesPendientes),
    resultadosAlcanzados: cleanText(draft.resultadosAlcanzados),
    orden,
  };
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validTipo(value: unknown, fallback: TipoActividad = "asignacion"): TipoActividad {
  return TIPOS.some((tipo) => tipo.id === value) ? (value as TipoActividad) : fallback;
}

function validEstado(value: unknown, fallback: EstadoActividad = "pendiente"): EstadoActividad {
  return ESTADOS.some((estado) => estado.id === value) ? (value as EstadoActividad) : fallback;
}

function clampDays(value: unknown): number {
  const days = Number(value);
  if (!Number.isFinite(days)) return 7;
  return Math.min(365, Math.max(0, Math.round(days)));
}

function cleanDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = value.split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function sanitizeMeetingDateTime(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const [dateRaw, timeRaw] = raw.split("T");
  const date = cleanDate(dateRaw) || TODAY_ISO;
  const time = typeof timeRaw === "string" && /^\d{2}:\d{2}/.test(timeRaw) ? timeRaw.slice(0, 5) : "09:00";
  return `${date}T${time}`;
}

function cleanParticipantes(value: unknown, responsableId: string, funcionarioIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (id): id is string => typeof id === "string" && id !== responsableId && funcionarioIds.has(id),
      ),
    ),
  );
}
