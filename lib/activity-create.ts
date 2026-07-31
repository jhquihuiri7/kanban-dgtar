import { createHash, randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { ensureSchema, getPool, mapActividad, type DbActividad } from "./db";
import type { AuthUser } from "./auth-token";
import type { Actividad, EstadoActividad, TipoActividad } from "./data";

const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const ENTITY_ID_RE = /^\S.{0,198}\S$|^\S$/;
const ALLOWED_TYPES = new Set<TipoActividad>(["asignacion", "reunion"]);
const ALLOWED_CREATE_STATES = new Set<EstadoActividad>([
  "pendiente",
  "en_progreso",
  "en_revision",
  "cumplida",
]);

type UnknownRecord = Record<string, unknown>;

export class ActivityRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 409 | 422,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "ActivityRequestError";
  }
}

async function currentUserUnderWriteLock(client: PoolClient, userId: string): Promise<AuthUser> {
  const result = await client.query(
    `SELECT id, email, nombre, rol, funcionario_id
     FROM usuarios
     WHERE id = $1
     FOR SHARE`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ActivityRequestError(401, "UNAUTHENTICATED", "Tu sesión ya no corresponde a un usuario activo.");
  }
  if (row.rol !== "admin" && row.rol !== "user") {
    throw new ActivityRequestError(403, "FORBIDDEN", "Tu usuario no tiene un rol válido.");
  }
  return {
    id: row.id as string,
    email: row.email as string,
    nombre: (row.nombre as string) || "",
    role: row.rol,
    funcionarioId: (row.funcionario_id as string | null) ?? null,
  };
}

function assertAuthorizationContextUnchanged(expected: AuthUser, current: AuthUser): void {
  if (
    expected.role !== current.role ||
    (expected.funcionarioId ?? null) !== (current.funcionarioId ?? null)
  ) {
    throw new ActivityRequestError(
      409,
      "AUTHORIZATION_CONTEXT_CHANGED",
      "Tu perfil o permisos cambiaron durante el guardado. La actividad no se creó. Recarga la página; el borrador se conservará.",
    );
  }
}

export interface NormalizedActivityRequest {
  tipo: TipoActividad;
  titulo: string;
  descripcion: string;
  requestedFuncionarioId: string | null;
  participantesIds: string[];
  competenciaId: string;
  entregableId: string | null;
  estado: EstadoActividad;
  fechaInicio: string;
  fechaFin: string;
  observaciones: string;
  accionesPendientes: string;
  resultadosAlcanzados: string;
}

export interface CreateActivityResult {
  activity: DbActividad;
  idempotentReplay: boolean;
  revision: number;
}

export interface ActivityTrace {
  requestId: string;
  clientRequestId?: string;
  userId?: string;
  event: string;
  attempt?: number;
  verificationAttempt?: number;
  activityId?: string;
  errorCode?: string;
  errorType?: string;
  errorMessage?: string;
  errorStack?: string;
  detail?: Record<string, unknown>;
}

/**
 * Extracts the fields needed to understand a failure. Unlike a bare `errorType`
 * (which is just the class name), this captures the real message and, for
 * unexpected errors, a trimmed stack — the difference between "Error" and
 * knowing exactly which query or line blew up.
 */
export function errorTraceFields(
  err: unknown,
  opts?: { stack?: boolean },
): Pick<ActivityTrace, "errorType" | "errorMessage" | "errorStack"> {
  const fields: Pick<ActivityTrace, "errorType" | "errorMessage" | "errorStack"> = {
    errorType: err instanceof Error ? err.name : typeof err,
    errorMessage: err instanceof Error ? err.message : String(err),
  };
  if (opts?.stack && err instanceof Error && err.stack) {
    fields.errorStack = err.stack.split("\n").slice(0, 8).join("\n");
  }
  return fields;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} es obligatorio.`);
  }
  const clean = value.trim();
  if (!clean) throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} es obligatorio.`);
  if (clean.length > maxLength) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} excede la longitud permitida.`);
  }
  return clean;
}

function optionalText(value: unknown, field: string, maxLength: number): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} debe ser texto.`);
  }
  const clean = value.trim();
  if (clean.length > maxLength) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} excede la longitud permitida.`);
  }
  return clean;
}

function entityId(value: unknown, field: string, optional = false): string | null {
  if (optional && (value == null || value === "")) return null;
  if (typeof value !== "string") {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} no es válido.`);
  }
  const clean = value.trim();
  if (!ENTITY_ID_RE.test(clean)) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} no es válido.`);
  }
  return clean;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !isValidDate(value)) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} no es una fecha válida.`);
  }
  return value;
}

function validMeetingDateTime(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", `${field} es obligatoria.`);
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !isValidDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59) {
    throw new ActivityRequestError(
      422,
      "VALIDATION_ERROR",
      `${field} no contiene una fecha y hora válidas.`,
    );
  }
  return value;
}

export function normalizeClientRequestId(value: unknown): string {
  if (typeof value !== "string") {
    throw new ActivityRequestError(400, "INVALID_REQUEST", "clientRequestId es obligatorio.");
  }
  const clean = value.trim();
  if (!CLIENT_REQUEST_ID_RE.test(clean)) {
    throw new ActivityRequestError(400, "INVALID_REQUEST", "clientRequestId no tiene un formato válido.");
  }
  return clean;
}

export function normalizeActivityRequest(value: unknown): NormalizedActivityRequest {
  if (!isRecord(value)) {
    throw new ActivityRequestError(400, "INVALID_REQUEST", "activity debe ser un objeto.");
  }

  if (!ALLOWED_TYPES.has(value.tipo as TipoActividad)) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", "tipo no es válido.");
  }
  if (!ALLOWED_CREATE_STATES.has(value.estado as EstadoActividad)) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", "estado no es válido.");
  }

  const tipo = value.tipo as TipoActividad;
  const participantesRaw = value.participantesIds ?? [];
  if (!Array.isArray(participantesRaw) || participantesRaw.length > 200) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", "participantesIds no es válido.");
  }
  const participantesIds = Array.from(
    new Set(participantesRaw.map((id) => entityId(id, "participantesIds") as string)),
  ).sort();

  const fechaInicio =
    tipo === "reunion"
      ? validMeetingDateTime(value.fechaInicio, "fechaInicio")
      : validDate(value.fechaInicio, "fechaInicio");
  const fechaFin =
    tipo === "reunion"
      ? validMeetingDateTime(value.fechaFin, "fechaFin")
      : validDate(value.fechaFin, "fechaFin");
  if (tipo === "asignacion" && fechaInicio > fechaFin) {
    throw new ActivityRequestError(
      422,
      "VALIDATION_ERROR",
      "fechaInicio no puede ser posterior a fechaFin.",
    );
  }
  if (tipo === "reunion" && fechaInicio !== fechaFin) {
    throw new ActivityRequestError(
      422,
      "VALIDATION_ERROR",
      "fechaInicio y fechaFin deben ser exactamente iguales para una reunión.",
    );
  }

  if (value.fechaCreacion != null) validDate(value.fechaCreacion, "fechaCreacion");
  if (value.fechaCumplimiento != null) validDate(value.fechaCumplimiento, "fechaCumplimiento");

  return {
    tipo,
    titulo: requiredText(value.titulo, "titulo", 500),
    descripcion: optionalText(value.descripcion, "descripcion", 20_000),
    requestedFuncionarioId: entityId(value.funcionarioId, "funcionarioId", true),
    participantesIds,
    competenciaId: entityId(value.competenciaId, "competenciaId") as string,
    entregableId: entityId(value.entregableId, "entregableId", true),
    estado: value.estado as EstadoActividad,
    fechaInicio,
    fechaFin,
    observaciones: optionalText(value.observaciones, "observaciones", 20_000),
    accionesPendientes: optionalText(value.accionesPendientes, "accionesPendientes", 20_000),
    resultadosAlcanzados: optionalText(value.resultadosAlcanzados, "resultadosAlcanzados", 20_000),
  };
}

export function todayIsoGalapagos(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Pacific/Galapagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function activityRequestFingerprint(
  request: NormalizedActivityRequest,
  funcionarioId: string,
): string {
  const canonical = {
    tipo: request.tipo,
    titulo: request.titulo,
    descripcion: request.descripcion,
    funcionarioId,
    participantesIds: request.participantesIds.filter((id) => id !== funcionarioId).sort(),
    competenciaId: request.competenciaId,
    entregableId: request.entregableId,
    estado: request.estado,
    fechaInicio: request.fechaInicio,
    fechaFin: request.fechaFin,
    observaciones: request.observaciones,
    accionesPendientes: request.accionesPendientes,
    resultadosAlcanzados: request.resultadosAlcanzados,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function safeRevision(value: unknown): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid stored revision");
  return revision;
}

async function safeRollback(client: PoolClient, operation: string): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error(
      JSON.stringify({
        scope: "activity-persistence",
        timestamp: new Date().toISOString(),
        event: "rollback_failed",
        operation,
        errorType: rollbackError instanceof Error ? rollbackError.name : typeof rollbackError,
      }),
    );
  }
}

async function resolveAndValidateReferences(
  client: PoolClient,
  request: NormalizedActivityRequest,
  user: AuthUser,
): Promise<{ funcionarioId: string; participantesIds: string[] }> {
  if (
    user.role !== "admin" &&
    request.requestedFuncionarioId &&
    request.requestedFuncionarioId !== user.funcionarioId
  ) {
    throw new ActivityRequestError(
      409,
      "AUTHORIZATION_CONTEXT_CHANGED",
      "Tu perfil o permisos cambiaron durante el guardado. La actividad no se creó. Recarga la página; el borrador se conservará.",
    );
  }
  const funcionarioId =
    user.role === "admin"
      ? request.requestedFuncionarioId
      : user.funcionarioId;

  if (!funcionarioId) {
    throw new ActivityRequestError(
      user.role === "admin" ? 422 : 403,
      user.role === "admin" ? "VALIDATION_ERROR" : "FORBIDDEN",
      user.role === "admin"
        ? "funcionarioId es obligatorio para un administrador."
        : "Tu usuario no está vinculado a un funcionario.",
    );
  }

  const funcionarioResult = await client.query("SELECT id FROM funcionarios WHERE id = $1", [funcionarioId]);
  if (!funcionarioResult.rows[0]) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", "El funcionario indicado no existe.");
  }

  const competenciaResult = await client.query(
    "SELECT id, gestion_id FROM competencias WHERE id = $1",
    [request.competenciaId],
  );
  const competencia = competenciaResult.rows[0];
  if (!competencia) {
    throw new ActivityRequestError(422, "VALIDATION_ERROR", "La competencia indicada no existe.");
  }

  if (request.entregableId) {
    const entregableResult = await client.query(
      "SELECT id, gestion_id FROM entregables WHERE id = $1",
      [request.entregableId],
    );
    const entregable = entregableResult.rows[0];
    if (!entregable) {
      throw new ActivityRequestError(422, "VALIDATION_ERROR", "El entregable indicado no existe.");
    }
    if (entregable.gestion_id !== competencia.gestion_id) {
      throw new ActivityRequestError(
        422,
        "VALIDATION_ERROR",
        "El entregable y la competencia deben pertenecer a la misma gestión.",
      );
    }
  }

  const participantesIds = request.participantesIds.filter((id) => id !== funcionarioId);
  if (participantesIds.length > 0) {
    const participantesResult = await client.query(
      "SELECT id FROM funcionarios WHERE id = ANY($1::text[])",
      [participantesIds],
    );
    if (participantesResult.rows.length !== participantesIds.length) {
      throw new ActivityRequestError(422, "VALIDATION_ERROR", "Uno o más participantes no existen.");
    }
  }

  return { funcionarioId, participantesIds };
}

async function participantesForActivity(client: PoolClient, activityId: string): Promise<string[]> {
  const result = await client.query(
    `SELECT funcionario_id
     FROM actividad_participantes
     WHERE actividad_id = $1
     ORDER BY funcionario_id`,
    [activityId],
  );
  return result.rows.map((row) => row.funcionario_id as string);
}

function assertActivityVisibleToUser(activity: DbActividad, user: AuthUser): void {
  if (user.role === "admin") return;
  if (
    user.funcionarioId &&
    (activity.funcionarioId === user.funcionarioId || activity.participantesIds.includes(user.funcionarioId))
  ) return;
  throw new ActivityRequestError(403, "FORBIDDEN", "Ya no tienes permisos para consultar esta actividad.");
}

async function conflictingActivity(
  client: PoolClient,
  clientRequestId: string,
  user: AuthUser,
  fingerprint: string,
): Promise<DbActividad> {
  const result = await client.query(
    "SELECT * FROM actividades WHERE client_request_id = $1",
    [clientRequestId],
  );
  const row = result.rows[0];
  if (!row || row.created_by_user_id !== user.id || row.request_fingerprint !== fingerprint) {
    throw new ActivityRequestError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya fue utilizada por otra operación.",
    );
  }
  const activity = mapActividad(row);
  activity.participantesIds = await participantesForActivity(client, activity.id);
  assertActivityVisibleToUser(activity, user);
  return activity;
}

async function replayFromLedger(
  client: PoolClient,
  clientRequestId: string,
  request: NormalizedActivityRequest,
  user: AuthUser,
): Promise<DbActividad | null> {
  const ledgerResult = await client.query(
    `SELECT created_by_user_id, request_fingerprint, funcionario_id, activity_id
     FROM activity_creation_requests
     WHERE client_request_id = $1`,
    [clientRequestId],
  );
  const ledger = ledgerResult.rows[0];
  if (!ledger) return null;

  const funcionarioId = ledger.funcionario_id as string;
  const fingerprint = activityRequestFingerprint(request, funcionarioId);
  if (
    ledger.created_by_user_id !== user.id ||
    ledger.request_fingerprint !== fingerprint ||
    (user.role === "admin" && request.requestedFuncionarioId !== funcionarioId)
  ) {
    throw new ActivityRequestError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya fue utilizada por otra operación.",
    );
  }

  const activityResult = await client.query("SELECT * FROM actividades WHERE id = $1", [ledger.activity_id]);
  const row = activityResult.rows[0];
  if (!row) {
    throw new ActivityRequestError(
      409,
      "IDEMPOTENCY_RESOURCE_GONE",
      "Esta operación ya fue procesada, pero su actividad fue eliminada posteriormente. No se creó un duplicado.",
    );
  }
  const activity = mapActividad(row);
  activity.participantesIds = await participantesForActivity(client, activity.id);
  assertActivityVisibleToUser(activity, user);
  return activity;
}

export async function createActivityIdempotent(input: {
  clientRequestId: string;
  request: NormalizedActivityRequest;
  user: AuthUser;
}): Promise<CreateActivityResult> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const revisionResult = await client.query(
      "SELECT revision FROM data_revision WHERE id = 1 FOR UPDATE",
    );
    if (!revisionResult.rows[0]) throw new Error("Missing data revision");
    const currentRevision = safeRevision(revisionResult.rows[0].revision);
    const currentUser = await currentUserUnderWriteLock(client, input.user.id);
    // Never reinterpret an in-flight request under a different role or linked
    // employee. The caller must refresh and consciously retry the retained
    // draft with the new authorization context.
    assertAuthorizationContextUnchanged(input.user, currentUser);

    const replay = await replayFromLedger(client, input.clientRequestId, input.request, currentUser);
    if (replay) {
      await client.query("COMMIT");
      return { activity: replay, idempotentReplay: true, revision: currentRevision };
    }

    const { funcionarioId, participantesIds } = await resolveAndValidateReferences(client, input.request, currentUser);
    const fingerprint = activityRequestFingerprint(input.request, funcionarioId);
    const today = todayIsoGalapagos();
    const fechaCumplimiento = input.request.estado === "cumplida" ? today : null;
    const activityId = `a_${randomUUID()}`;
    const orderResult = await client.query("SELECT COALESCE(MAX(orden), -1) + 1 AS orden FROM actividades");
    const orden = Number(orderResult.rows[0]?.orden ?? 0);

    const insertResult = await client.query(
      `INSERT INTO actividades
         (id, client_request_id, created_by_user_id, request_fingerprint,
          tipo, titulo, descripcion, funcionario_id, competencia_id, entregable_id, estado,
          fecha_creacion, fecha_inicio, fecha_fin, fecha_cumplimiento,
          observaciones, acciones_pendientes, resultados_alcanzados, orden,
          created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        activityId,
        input.clientRequestId,
        currentUser.id,
        fingerprint,
        input.request.tipo,
        input.request.titulo,
        input.request.descripcion,
        funcionarioId,
        input.request.competenciaId,
        input.request.entregableId,
        input.request.estado,
        today,
        input.request.fechaInicio,
        input.request.fechaFin,
        fechaCumplimiento,
        input.request.observaciones,
        input.request.accionesPendientes,
        input.request.resultadosAlcanzados,
        orden,
      ],
    );

    const insertedRow = insertResult.rows[0];
    if (!insertedRow) {
      const existing = await conflictingActivity(
        client,
        input.clientRequestId,
        currentUser,
        fingerprint,
      );
      await client.query(
        `INSERT INTO activity_creation_requests
           (client_request_id, created_by_user_id, request_fingerprint, funcionario_id, activity_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_request_id) DO NOTHING`,
        [input.clientRequestId, currentUser.id, fingerprint, funcionarioId, existing.id],
      );
      await client.query("COMMIT");
      return { activity: existing, idempotentReplay: true, revision: currentRevision };
    }

    for (const participanteId of participantesIds) {
      await client.query(
        `INSERT INTO actividad_participantes (actividad_id, funcionario_id)
         VALUES ($1, $2)`,
        [activityId, participanteId],
      );
    }

    await client.query(
      `INSERT INTO activity_creation_requests
         (client_request_id, created_by_user_id, request_fingerprint, funcionario_id, activity_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.clientRequestId, currentUser.id, fingerprint, funcionarioId, activityId],
    );

    const nextRevisionResult = await client.query(
      `UPDATE data_revision
       SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING revision`,
    );
    const nextRevision = safeRevision(nextRevisionResult.rows[0]?.revision);
    const activity = mapActividad(insertedRow);
    activity.participantesIds = participantesIds;
    await client.query("COMMIT");
    return { activity, idempotentReplay: false, revision: nextRevision };
  } catch (err) {
    await safeRollback(client, "create_activity");
    throw err;
  } finally {
    client.release();
  }
}

export async function findVerifiedActivity(
  clientRequestId: string,
  user: AuthUser,
): Promise<DbActividad | null> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await client.query(
      `SELECT request.activity_id AS ledger_activity_id, a.*
       FROM activity_creation_requests request
       LEFT JOIN actividades a ON a.id = request.activity_id
       WHERE request.client_request_id = $1
         AND request.created_by_user_id = $2`,
      [clientRequestId, user.id],
    );
    const row = result.rows[0];
    if (!row) {
      await client.query("COMMIT");
      return null;
    }
    if (!row.id) {
      throw new ActivityRequestError(
        409,
        "IDEMPOTENCY_RESOURCE_GONE",
        "Esta operación ya fue procesada, pero su actividad fue eliminada posteriormente. No se creó un duplicado.",
      );
    }
    const activity = mapActividad(row);
    activity.participantesIds = await participantesForActivity(client, activity.id);
    assertActivityVisibleToUser(activity, user);
    await client.query("COMMIT");
    return activity;
  } catch (err) {
    await safeRollback(client, "verify_activity");
    throw err;
  } finally {
    client.release();
  }
}

export function requestIdFor(req: Request): string {
  const supplied = req.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(supplied)
    ? supplied
    : `req_${randomUUID()}`;
}

export function retryAttemptFor(req: Request): number {
  const raw = Number(req.headers.get("x-retry-attempt") ?? "1");
  return Number.isInteger(raw) && raw >= 1 && raw <= 100 ? raw : 1;
}

export function verificationAttemptFor(req: Request): number {
  const raw = Number(req.headers.get("x-verification-attempt") ?? "1");
  return Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : 1;
}

export function logActivityTrace(trace: ActivityTrace): void {
  console.info(
    JSON.stringify({
      scope: "activity-persistence",
      timestamp: new Date().toISOString(),
      ...trace,
    }),
  );
}

export function publicActivity(activity: DbActividad): Actividad {
  const {
    clientRequestId: _clientRequestId,
    createdByUserId: _createdByUserId,
    requestFingerprint: _requestFingerprint,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...safe
  } = activity;
  return safe;
}
