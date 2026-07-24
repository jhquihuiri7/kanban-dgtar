// REST endpoint backing the Kanban board with PostgreSQL.
//   GET  /api/data  → { funcionarios, competencias, actividades }
//   PUT  /api/data  → overwrite all three tables with the posted document
//
// node-postgres needs the Node runtime (not Edge); never cache the responses.

import { NextResponse } from "next/server";
import {
  AuthorizationContextChangedError,
  RevisionConflictError,
  readAllWithRevision,
  writeAll,
  type DbData,
} from "@/lib/db";
import { requireUser } from "@/lib/auth-server";
import { syncLatestGoogleCalendars } from "@/lib/google-calendar";
import { validateActivityDocument, validateExistingActivityDocumentIds } from "@/lib/activity-document";
import { errorTraceFields, logActivityTrace, requestIdFor, todayIsoGalapagos } from "@/lib/activity-create";
import { mergeUserActivityChanges } from "@/lib/activity-access";
import {
  ESTADOS,
  TIPOS,
  actividadIncludesFuncionario,
  type Actividad,
  type EstadoActividad,
  type TipoActividad,
} from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };

function queueDocumentGoogleSync(trace: { requestId: string; userId: string }) {
  logActivityTrace({ ...trace, event: "document_google_sync_queued" });
  void syncLatestGoogleCalendars()
    .then((summary) => {
      logActivityTrace({
        ...trace,
        event: summary.failed > 0 ? "document_google_sync_completed_with_errors" : "document_google_sync_completed",
        ...(summary.failed > 0
          ? {
              errorCode: "GOOGLE_SYNC_FAILED",
              detail: { synced: summary.synced, failed: summary.failed, errors: summary.errors },
            }
          : {}),
      });
    })
    .catch((error: unknown) => {
      logActivityTrace({
        ...trace,
        event: "document_google_sync_failed",
        errorCode: "GOOGLE_SYNC_FAILED",
        ...errorTraceFields(error, { stack: true }),
      });
    });
}

class DataRouteError extends Error {
  constructor(
    readonly status: 400 | 403 | 422,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export async function GET(req: Request) {
  const requestId = requestIdFor(req);
  try {
    const user = await requireUser();
    const snapshot = await readAllWithRevision();
    return NextResponse.json(
      { ...filterForUser(snapshot.data, user), revision: snapshot.revision },
      { headers: { ...NO_STORE_HEADERS, "X-Request-Id": requestId } },
    );
  } catch (err) {
    const readErrorCode =
      err instanceof Error && err.message === "No autenticado" ? "UNAUTHENTICATED" : "INTERNAL_ERROR";
    logActivityTrace({
      requestId,
      event: "document_read_failed",
      errorCode: readErrorCode,
      ...errorTraceFields(err, { stack: readErrorCode === "INTERNAL_ERROR" }),
    });
    return dataErrorResponse(err, requestId);
  }
}

export async function PUT(req: Request) {
  const requestId = requestIdFor(req);
  let userId: string | undefined;
  try {
    const user = await requireUser();
    userId = user.id;
    let body: Partial<DbData> & { revision?: unknown };
    try {
      body = (await req.json()) as Partial<DbData> & { revision?: unknown };
    } catch {
      throw new DataRouteError(400, "INVALID_REQUEST", "El cuerpo JSON no es válido.");
    }
    if (
      !body ||
      !Array.isArray(body.gestiones) ||
      !Array.isArray(body.funcionarios) ||
      !Array.isArray(body.competencias) ||
      !Array.isArray(body.entregables) ||
      !Array.isArray(body.actividades)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Cuerpo inválido: se esperan gestiones, funcionarios, competencias, entregables y actividades.",
          code: "INVALID_REQUEST",
          requestId,
        },
        { status: 400, headers: { ...NO_STORE_HEADERS, "X-Request-Id": requestId } },
      );
    }
    if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || body.revision < 0) {
      throw new DataRouteError(400, "INVALID_REQUEST", "revision es obligatoria y debe ser un entero válido.");
    }
    const expectedRevision = body.revision;

    const snapshot = await readAllWithRevision();
    if (snapshot.revision !== expectedRevision) {
      throw new RevisionConflictError(expectedRevision, snapshot.revision);
    }
    const current = snapshot.data;
    const activityIdError = validateExistingActivityDocumentIds(current.actividades, body.actividades);
    if (activityIdError) throw new DataRouteError(422, activityIdError.code, activityIdError.message);
    const next: DbData =
      user.role === "admin"
        ? {
            gestiones: body.gestiones,
            funcionarios: body.funcionarios,
            competencias: body.competencias,
            entregables: body.entregables,
            actividades: body.actividades,
          }
        : mergeUserWrite(current, body.actividades, user.funcionarioId);
    const documentError = validateActivityDocument(next);
    if (documentError) throw new DataRouteError(422, documentError.code, documentError.message);

    logActivityTrace({
      requestId,
      userId,
      event: "document_write_started",
      detail: {
        role: user.role,
        expectedRevision,
        actividades: next.actividades.length,
        funcionarios: next.funcionarios.length,
        competencias: next.competencias.length,
        entregables: next.entregables.length,
      },
    });
    const revision = await writeAll(next, expectedRevision, {
      userId: user.id,
      role: user.role,
      funcionarioId: user.funcionarioId,
    });
    logActivityTrace({ requestId, userId, event: "document_write_committed" });
    queueDocumentGoogleSync({ requestId, userId: user.id });
    return NextResponse.json(
      { ok: true, googleSync: { queued: true }, revision, requestId },
      { headers: { ...NO_STORE_HEADERS, "X-Request-Id": requestId, "X-Data-Revision": String(revision) } },
    );
  } catch (err) {
    const errorCode =
      err instanceof RevisionConflictError
        ? err.code
        : err instanceof AuthorizationContextChangedError
          ? err.code
        : err instanceof DataRouteError
          ? err.code
          : err instanceof Error && err.message === "No autenticado"
            ? "UNAUTHENTICATED"
            : "INTERNAL_ERROR";
    logActivityTrace({
      requestId,
      userId,
      event: "document_write_failed",
      errorCode,
      ...errorTraceFields(err, { stack: errorCode === "INTERNAL_ERROR" }),
    });
    return dataErrorResponse(err, requestId);
  }
}

function dataErrorResponse(err: unknown, requestId: string) {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let error = "No se pudieron guardar los datos.";
  let currentRevision: number | undefined;
  if (err instanceof RevisionConflictError) {
    status = 409;
    code = err.code;
    error = err.message;
    currentRevision = err.currentRevision;
  } else if (err instanceof AuthorizationContextChangedError) {
    status = 409;
    code = err.code;
    error = err.message;
  } else if (err instanceof DataRouteError) {
    status = err.status;
    code = err.code;
    error = err.publicMessage;
  } else if (err instanceof Error && err.message === "No autenticado") {
    status = 401;
    code = "UNAUTHENTICATED";
    error = "No autenticado";
  } else if (err instanceof Error && err.message === "No autorizado") {
    status = 403;
    code = "FORBIDDEN";
    error = "No autorizado";
  }
  return NextResponse.json(
    { ok: false, error, code, requestId, ...(currentRevision == null ? {} : { currentRevision }) },
    { status, headers: { ...NO_STORE_HEADERS, "X-Request-Id": requestId } },
  );
}

function filterForUser(data: DbData, user: { role: string; funcionarioId: string | null }): DbData {
  if (user.role === "admin") return data;
  const actividades = data.actividades.filter((a) => actividadIncludesFuncionario(a, user.funcionarioId));
  return {
    gestiones: data.gestiones,
    funcionarios: data.funcionarios,
    competencias: data.competencias,
    entregables: data.entregables,
    actividades,
  };
}

function mergeUserWrite(current: DbData, posted: Actividad[], funcionarioId: string | null): DbData {
  if (!funcionarioId) {
    throw new DataRouteError(403, "FORBIDDEN", "Tu usuario no está vinculado a un funcionario.");
  }

  const today = todayIsoGalapagos();

  const competenciaIds = new Set(current.competencias.map((c) => c.id));
  const funcionarioIds = new Set(current.funcionarios.map((f) => f.id));
  const entregableIds = new Set(current.entregables.map((e) => e.id));

  const actividades = mergeUserActivityChanges(
    current.actividades,
    posted,
    funcionarioId,
    (draft, activity) =>
      sanitizeUserActivity(
        draft,
        activity.funcionarioId,
        competenciaIds,
        funcionarioIds,
        entregableIds,
        activity.orden,
        today,
        activity,
      ),
  );

  return {
    gestiones: current.gestiones,
    funcionarios: current.funcionarios,
    competencias: current.competencias,
    entregables: current.entregables,
    actividades,
  };
}

function sanitizeUserActivity(
  draft: Actividad,
  responsableId: string,
  competenciaIds: Set<string>,
  funcionarioIds: Set<string>,
  entregableIds: Set<string>,
  orden: number,
  today: string,
  current?: Actividad,
): Actividad {
  const tipo = validTipo(draft.tipo, current?.tipo);
  const estado = validEstado(draft.estado, current?.estado);
  const fechaCreacion = current?.fechaCreacion || today;
  const titulo = cleanText(draft.titulo) || current?.titulo || "Nueva actividad";
  const competenciaId = competenciaIds.has(draft.competenciaId)
    ? draft.competenciaId
    : current?.competenciaId && competenciaIds.has(current.competenciaId)
      ? current.competenciaId
      : Array.from(competenciaIds)[0];
  if (!competenciaId) throw new Error("No existe una competencia válida para crear la actividad.");
  const entregableId = cleanEntregableId(draft.entregableId, entregableIds);

  const { fechaInicio, fechaFin } = sanitizeActivityDates(tipo, draft, current, today);
  const fechaCumplimiento =
    estado === "cumplida" ? cleanDate(draft.fechaCumplimiento) || current?.fechaCumplimiento || today : null;

  return {
    id: draft.id,
    tipo,
    titulo,
    descripcion: cleanText(draft.descripcion),
    funcionarioId: responsableId,
    participantesIds:
      tipo === "reunion" ? cleanParticipantes(draft.participantesIds, responsableId, funcionarioIds) : [],
    competenciaId,
    entregableId,
    estado,
    fechaCreacion,
    fechaInicio,
    fechaFin,
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

// A diferencia de competenciaId (obligatorio, con fallback en cascada),
// entregableId es opcional: null es un valor válido, no hace falta fallback.
function cleanEntregableId(value: unknown, entregableIds: Set<string>): string | null {
  return typeof value === "string" && entregableIds.has(value) ? value : null;
}

function validTipo(value: unknown, fallback: TipoActividad = "asignacion"): TipoActividad {
  return TIPOS.some((tipo) => tipo.id === value) ? (value as TipoActividad) : fallback;
}

function validEstado(value: unknown, fallback: EstadoActividad = "pendiente"): EstadoActividad {
  return ESTADOS.some((estado) => estado.id === value) ? (value as EstadoActividad) : fallback;
}

function sanitizeActivityDates(
  tipo: TipoActividad,
  draft: Actividad,
  current: Actividad | undefined,
  today: string,
): Pick<Actividad, "fechaInicio" | "fechaFin"> {
  if (tipo === "reunion") {
    const dateTime =
      cleanMeetingDateTime(draft.fechaInicio) ||
      cleanMeetingDateTime(draft.fechaFin) ||
      cleanMeetingDateTime(current?.fechaInicio) ||
      cleanMeetingDateTime(current?.fechaFin) ||
      `${today}T09:00`;
    return { fechaInicio: dateTime, fechaFin: dateTime };
  }

  const fechaInicio =
    cleanDate(draft.fechaInicio) ||
    (current?.tipo === "asignacion" ? cleanDate(current.fechaInicio) : "") ||
    today;
  const requestedFin =
    cleanDate(draft.fechaFin) ||
    (current?.tipo === "asignacion" ? cleanDate(current.fechaFin) : "") ||
    fechaInicio;
  return {
    fechaInicio,
    fechaFin: requestedFin >= fechaInicio ? requestedFin : fechaInicio,
  };
}

function cleanDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = value.split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function cleanMeetingDateTime(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (
    !match ||
    !cleanDate(match[1]) ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59
  ) {
    return "";
  }
  return value;
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
