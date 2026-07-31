// Server-only PostgreSQL data layer for the Kanban DGTAR app.
// Tables (gestiones, funcionarios, competencias, entregables, actividades)
// map 1:1 to the entities in `./data`. Connection comes from DATABASE_URL.
// This module must never be imported from client code.

import { readFileSync } from "fs";
import { join } from "path";
import { Pool, type PoolClient } from "pg";
import type { Actividad, Competencia, EstadoActividad, Entregable, Funcionario, Gestion, TipoActividad } from "./data";

export interface ActivityPersistenceMetadata {
  clientRequestId: string | null;
  createdByUserId: string | null;
  requestFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DbActividad = Actividad & ActivityPersistenceMetadata;

export interface DbData {
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  actividades: Actividad[];
}

export interface DbSnapshot {
  data: DbData;
  revision: number;
}

export class RevisionConflictError extends Error {
  readonly code = "STALE_REVISION";

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super("Los datos cambiaron desde la última lectura.");
    this.name = "RevisionConflictError";
  }
}

export interface WriteAuthorizationContext {
  userId: string;
  role: "admin" | "user";
  funcionarioId: string | null;
}

export class AuthorizationContextChangedError extends Error {
  readonly code = "AUTHORIZATION_CHANGED";

  constructor() {
    super("Tu cuenta o tus permisos cambiaron. Actualiza los datos antes de guardar nuevamente.");
    this.name = "AuthorizationContextChangedError";
  }
}

// A single pool is reused across requests / hot reloads.
let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Falta la variable de entorno DATABASE_URL (ver .env.example).");
    }
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5_000,
      query_timeout: 30_000,
      statement_timeout: 30_000,
    });
    pool.on("error", (error) => {
      const pgError = error as Error & { code?: string };
      console.error(
        JSON.stringify({
          scope: "database",
          timestamp: new Date().toISOString(),
          event: "idle_pool_client_error",
          errorType: pgError.name,
          ...(pgError.code ? { errorCode: pgError.code } : {}),
        }),
      );
    });
  }
  return pool;
}

/* ── Row ↔ object mapping (DB columns are snake_case) ───────────────── */

type Row = Record<string, unknown>;

function mapGestion(r: Row): Gestion {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    color: r.color as string,
  };
}

function mapFuncionario(r: Row): Funcionario {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    email: r.email as string,
    cargo: r.cargo as string,
    gestionId: r.gestion_id as string,
    color: r.color as string,
  };
}

function mapCompetencia(r: Row): Competencia {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    gestionId: r.gestion_id as string,
  };
}

function mapEntregable(r: Row): Entregable {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    gestionId: r.gestion_id as string,
  };
}

function timestampText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return "";
}

export function mapActividad(r: Row): DbActividad {
  return {
    id: r.id as string,
    tipo: (r.tipo as TipoActividad) ?? "asignacion",
    titulo: r.titulo as string,
    descripcion: r.descripcion as string,
    funcionarioId: r.funcionario_id as string,
    participantesIds: [],
    competenciaId: r.competencia_id as string,
    entregableId: (r.entregable_id as string | null) ?? null,
    estado: r.estado as EstadoActividad,
    fechaCreacion: r.fecha_creacion as string,
    fechaInicio: r.fecha_inicio as string,
    fechaFin: r.fecha_fin as string,
    fechaCumplimiento: (r.fecha_cumplimiento as string | null) ?? null,
    observaciones: r.observaciones as string,
    accionesPendientes: (r.acciones_pendientes as string) ?? "",
    resultadosAlcanzados: (r.resultados_alcanzados as string) ?? "",
    orden: r.orden as number,
    clientRequestId: (r.client_request_id as string | null) ?? null,
    createdByUserId: (r.created_by_user_id as string | null) ?? null,
    requestFingerprint: (r.request_fingerprint as string | null) ?? null,
    createdAt: timestampText(r.created_at),
    updatedAt: timestampText(r.updated_at),
  };
}

function activityWithoutPersistenceMetadata(activity: DbActividad): Actividad {
  const {
    clientRequestId: _clientRequestId,
    createdByUserId: _createdByUserId,
    requestFingerprint: _requestFingerprint,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...businessActivity
  } = activity;
  return businessActivity;
}

/* ── Schema ─────────────────────────────────────────────────────────── */

// Idempotent: runs db/schema.sql (CREATE TABLE IF NOT EXISTS …). Resolved
// relative to the process working directory (project root / /app in Docker).
export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        // schemaPromise only coordinates one Node process. The advisory lock
        // serializes cold starts from multiple replicas as one migration.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["kanban-dgtar-schema-v1"]);
        await client.query(sql);
        await client.query("COMMIT");
      } catch (error) {
        await safeRollback(client, "ensure_schema");
        throw error;
      } finally {
        client.release();
      }
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  await schemaPromise;
}

/* ── Read / write ───────────────────────────────────────────────────── */

function revisionNumber(value: unknown): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("La revisión de datos almacenada no es válida.");
  }
  return revision;
}

async function safeRollback(client: PoolClient, operation: string): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error(
      JSON.stringify({
        scope: "database",
        timestamp: new Date().toISOString(),
        event: "rollback_failed",
        operation,
        errorType: rollbackError instanceof Error ? rollbackError.name : typeof rollbackError,
      }),
    );
  }
}

async function readAllFrom(db: PoolClient): Promise<DbData> {
  // Todas las consultas usan la misma conexión y el mismo snapshot abierto por
  // readAllWithRevision; no se mezclan actividades y participantes de commits
  // diferentes.
  const g = await db.query("SELECT * FROM gestiones ORDER BY id");
  const f = await db.query("SELECT * FROM funcionarios ORDER BY id");
  const c = await db.query("SELECT * FROM competencias ORDER BY id");
  const e = await db.query("SELECT * FROM entregables ORDER BY id");
  const a = await db.query("SELECT * FROM actividades ORDER BY orden, id");
  const p = await db.query(
    "SELECT actividad_id, funcionario_id FROM actividad_participantes ORDER BY actividad_id, funcionario_id",
  );
  const participantesByActividad = new Map<string, string[]>();
  for (const row of p.rows) {
    const actividadId = row.actividad_id as string;
    const funcionarioId = row.funcionario_id as string;
    const ids = participantesByActividad.get(actividadId);
    if (ids) ids.push(funcionarioId);
    else participantesByActividad.set(actividadId, [funcionarioId]);
  }
  return {
    gestiones: g.rows.map(mapGestion),
    funcionarios: f.rows.map(mapFuncionario),
    competencias: c.rows.map(mapCompetencia),
    entregables: e.rows.map(mapEntregable),
    actividades: a.rows.map((row) => {
      const actividad = activityWithoutPersistenceMetadata(mapActividad(row));
      return {
        ...actividad,
        participantesIds: participantesByActividad.get(actividad.id) ?? [],
      };
    }),
  };
}

export async function readAllWithRevision(): Promise<DbSnapshot> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    // La revisión se lee primero. Si un POST confirma después, el snapshot no
    // lo incluirá y su incremento hará que un PUT posterior sea rechazado.
    const revisionResult = await client.query("SELECT revision FROM data_revision WHERE id = 1");
    if (!revisionResult.rows[0]) throw new Error("Falta la fila de revisión de datos.");
    const revision = revisionNumber(revisionResult.rows[0].revision);
    const data = await readAllFrom(client);
    await client.query("COMMIT");
    return { data, revision };
  } catch (err) {
    await safeRollback(client, "read_snapshot");
    throw err;
  } finally {
    client.release();
  }
}

export async function readAll(): Promise<DbData> {
  return (await readAllWithRevision()).data;
}

// Full-document write inside a transaction. The revision row serializes this
// legacy operation with per-activity POSTs and rejects stale documents.
export async function writeAll(
  data: DbData,
  expectedRevision: number,
  actor: WriteAuthorizationContext,
): Promise<number> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const revisionResult = await client.query(
      "SELECT revision FROM data_revision WHERE id = 1 FOR UPDATE",
    );
    if (!revisionResult.rows[0]) throw new Error("Falta la fila de revisión de datos.");
    const currentRevision = revisionNumber(revisionResult.rows[0].revision);
    if (currentRevision !== expectedRevision) {
      throw new RevisionConflictError(expectedRevision, currentRevision);
    }

    // The route built `data` according to a previously-read role and
    // funcionario. Recheck both under the same serialization lock so a
    // promotion, demotion, reassignment or deletion cannot change the meaning
    // of a stale full-document payload.
    const actorResult = await client.query(
      "SELECT rol, funcionario_id FROM usuarios WHERE id = $1 FOR SHARE",
      [actor.userId],
    );
    const currentActor = actorResult.rows[0];
    if (
      !currentActor ||
      currentActor.rol !== actor.role ||
      ((currentActor.funcionario_id as string | null) ?? null) !== actor.funcionarioId
    ) {
      throw new AuthorizationContextChangedError();
    }

    const metadataResult = await client.query(
      `SELECT id, client_request_id, created_by_user_id, request_fingerprint, created_at, updated_at
       FROM actividades`,
    );
    const metadataById = new Map(
      metadataResult.rows.map((row) => [
        row.id as string,
        {
          clientRequestId: (row.client_request_id as string | null) ?? null,
          createdByUserId: (row.created_by_user_id as string | null) ?? null,
          requestFingerprint: (row.request_fingerprint as string | null) ?? null,
          createdAt: timestampText(row.created_at),
        },
      ]),
    );

    // Activities can be safely rewritten. Do not wholesale-delete funcionarios,
    // competencias, entregables or gestiones: usuarios.funcionario_id uses
    // ON DELETE SET NULL, so deleting and reinserting the same funcionario
    // would unlink users from their assigned funcionario.
    await client.query("DELETE FROM actividad_participantes");
    await client.query("DELETE FROM actividades");

    const gestionIds = data.gestiones.map((g) => g.id);
    const funcionarioIds = data.funcionarios.map((f) => f.id);
    const competenciaIds = data.competencias.map((c) => c.id);
    const entregableIds = data.entregables.map((e) => e.id);

    // Borrado hijo → padre: si el cliente quita una gestión del payload, debe
    // haber quitado (o reasignado) antes sus competencias/entregables/
    // funcionarios; de lo contrario este DELETE final sobre gestiones falla
    // por FK (RESTRICT en funcionarios) o cascada sobre lo que aún la referencie.
    if (entregableIds.length > 0) {
      await client.query("DELETE FROM entregables WHERE NOT (id = ANY($1::text[]))", [entregableIds]);
    } else {
      await client.query("DELETE FROM entregables");
    }

    if (competenciaIds.length > 0) {
      await client.query("DELETE FROM competencias WHERE NOT (id = ANY($1::text[]))", [competenciaIds]);
    } else {
      await client.query("DELETE FROM competencias");
    }

    if (funcionarioIds.length > 0) {
      await client.query("DELETE FROM funcionarios WHERE NOT (id = ANY($1::text[]))", [funcionarioIds]);
    } else {
      await client.query("DELETE FROM funcionarios");
    }

    if (gestionIds.length > 0) {
      await client.query("DELETE FROM gestiones WHERE NOT (id = ANY($1::text[]))", [gestionIds]);
    } else {
      await client.query("DELETE FROM gestiones");
    }

    for (const g of data.gestiones) {
      await client.query(
        `INSERT INTO gestiones (id, nombre, color)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
           SET nombre = EXCLUDED.nombre,
               color = EXCLUDED.color`,
        [g.id, g.nombre, g.color],
      );
    }
    for (const f of data.funcionarios) {
      await client.query(
        `INSERT INTO funcionarios (id, nombre, email, cargo, gestion_id, color)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
           SET nombre = EXCLUDED.nombre,
               email = EXCLUDED.email,
               cargo = EXCLUDED.cargo,
               gestion_id = EXCLUDED.gestion_id,
               color = EXCLUDED.color`,
        [f.id, f.nombre, f.email, f.cargo, f.gestionId, f.color],
      );
    }
    for (const c of data.competencias) {
      await client.query(
        `INSERT INTO competencias (id, nombre, gestion_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
           SET nombre = EXCLUDED.nombre,
               gestion_id = EXCLUDED.gestion_id`,
        [c.id, c.nombre, c.gestionId],
      );
    }
    for (const e of data.entregables) {
      await client.query(
        `INSERT INTO entregables (id, nombre, gestion_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
           SET nombre = EXCLUDED.nombre,
               gestion_id = EXCLUDED.gestion_id`,
        [e.id, e.nombre, e.gestionId],
      );
    }
    for (const a of data.actividades) {
      const existingMetadata = metadataById.get(a.id);
      // El documento cliente nunca puede cambiar una clave idempotente ni el
      // creador de una fila existente. Las filas legadas conservan NULL: este
      // endpoint ya no admite IDs de actividad que no existan en PostgreSQL.
      const clientRequestId = existingMetadata?.clientRequestId ?? null;
      const requestFingerprint = existingMetadata?.requestFingerprint ?? null;
      const createdByUserId = existingMetadata?.createdByUserId ?? null;
      const createdAt = existingMetadata?.createdAt || null;
      await client.query(
        `INSERT INTO actividades
           (id, tipo, titulo, descripcion, funcionario_id, competencia_id, entregable_id, estado,
            fecha_creacion, fecha_inicio, fecha_fin, fecha_cumplimiento,
            observaciones, acciones_pendientes, resultados_alcanzados, orden,
            client_request_id, created_by_user_id, request_fingerprint, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                 $17, $18, $19, COALESCE($20::timestamptz, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
        [
          a.id,
          a.tipo ?? "asignacion",
          a.titulo,
          a.descripcion,
          a.funcionarioId,
          a.competenciaId,
          a.entregableId ?? null,
          a.estado,
          a.fechaCreacion,
          a.fechaInicio,
          a.fechaFin,
          a.fechaCumplimiento,
          a.observaciones,
          a.accionesPendientes ?? "",
          a.resultadosAlcanzados ?? "",
          a.orden,
          clientRequestId,
          createdByUserId,
          requestFingerprint,
          createdAt,
        ],
      );

      const participantesIds = Array.from(
        new Set((a.participantesIds ?? []).filter((id) => id && id !== a.funcionarioId)),
      );
      for (const funcionarioId of participantesIds) {
        await client.query(
          `INSERT INTO actividad_participantes (actividad_id, funcionario_id)
           VALUES ($1, $2)`,
          [a.id, funcionarioId],
        );
      }
    }

    const nextRevisionResult = await client.query(
      `UPDATE data_revision
       SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING revision`,
    );
    const nextRevision = revisionNumber(nextRevisionResult.rows[0]?.revision);
    await client.query("COMMIT");
    return nextRevision;
  } catch (err) {
    await safeRollback(client, "write_document");
    throw err;
  } finally {
    client.release();
  }
}
