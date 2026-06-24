// Server-only PostgreSQL data layer for the Kanban DGTAR app.
// Three tables (funcionarios, competencias, actividades) map 1:1 to the
// entities in `./data`. Connection comes from DATABASE_URL. This module must
// never be imported from client code.

import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import type { Actividad, Competencia, EstadoActividad, Funcionario, TipoActividad, Unidad } from "./data";

export interface DbData {
  funcionarios: Funcionario[];
  competencias: Competencia[];
  actividades: Actividad[];
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
    pool = new Pool({ connectionString });
  }
  return pool;
}

/* ── Row ↔ object mapping (DB columns are snake_case) ───────────────── */

type Row = Record<string, unknown>;

function mapFuncionario(r: Row): Funcionario {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    email: r.email as string,
    cargo: r.cargo as string,
    unidad: r.unidad as Unidad,
    color: r.color as string,
  };
}

function mapCompetencia(r: Row): Competencia {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    unidad: r.unidad as Unidad,
  };
}

function mapActividad(r: Row): Actividad {
  return {
    id: r.id as string,
    tipo: (r.tipo as TipoActividad) ?? "asignacion",
    titulo: r.titulo as string,
    descripcion: r.descripcion as string,
    funcionarioId: r.funcionario_id as string,
    participantesIds: [],
    competenciaId: r.competencia_id as string,
    estado: r.estado as EstadoActividad,
    fechaCreacion: r.fecha_creacion as string,
    plazoDias: r.plazo_dias as number,
    fechaVencimiento: r.fecha_vencimiento as string,
    fechaCumplimiento: (r.fecha_cumplimiento as string | null) ?? null,
    observaciones: r.observaciones as string,
    accionesPendientes: (r.acciones_pendientes as string) ?? "",
    resultadosAlcanzados: (r.resultados_alcanzados as string) ?? "",
    orden: r.orden as number,
  };
}

/* ── Schema ─────────────────────────────────────────────────────────── */

// Idempotent: runs db/schema.sql (CREATE TABLE IF NOT EXISTS …). Resolved
// relative to the process working directory (project root / /app in Docker).
export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
      await getPool().query(sql);
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  await schemaPromise;
}

/* ── Read / write ───────────────────────────────────────────────────── */

export async function readAll(): Promise<DbData> {
  await ensureSchema();
  const db = getPool();
  const [f, c, a, p] = await Promise.all([
    db.query("SELECT * FROM funcionarios ORDER BY id"),
    db.query("SELECT * FROM competencias ORDER BY id"),
    db.query("SELECT * FROM actividades ORDER BY orden, id"),
    db.query("SELECT actividad_id, funcionario_id FROM actividad_participantes ORDER BY actividad_id, funcionario_id"),
  ]);
  const participantesByActividad = new Map<string, string[]>();
  for (const row of p.rows) {
    const actividadId = row.actividad_id as string;
    const funcionarioId = row.funcionario_id as string;
    const ids = participantesByActividad.get(actividadId);
    if (ids) ids.push(funcionarioId);
    else participantesByActividad.set(actividadId, [funcionarioId]);
  }
  return {
    funcionarios: f.rows.map(mapFuncionario),
    competencias: c.rows.map(mapCompetencia),
    actividades: a.rows.map((row) => {
      const actividad = mapActividad(row);
      return {
        ...actividad,
        participantesIds: participantesByActividad.get(actividad.id) ?? [],
      };
    }),
  };
}

// Full-document write inside a transaction. Activities are rewritten, while
// catalogs are upserted so existing usuario.funcionario_id links stay intact.
// Fine for a single-team internal tool (tens of rows); last writer wins, so it
// is not meant for simultaneous editors hitting the same data at once.
export async function writeAll(data: DbData): Promise<void> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Activities can be safely rewritten. Do not wholesale-delete funcionarios:
    // usuarios.funcionario_id uses ON DELETE SET NULL, so deleting and reinserting
    // the same funcionario would unlink users from their assigned funcionario.
    await client.query("DELETE FROM actividad_participantes");
    await client.query("DELETE FROM actividades");

    const funcionarioIds = data.funcionarios.map((f) => f.id);
    const competenciaIds = data.competencias.map((c) => c.id);

    if (funcionarioIds.length > 0) {
      await client.query("DELETE FROM funcionarios WHERE NOT (id = ANY($1::text[]))", [funcionarioIds]);
    } else {
      await client.query("DELETE FROM funcionarios");
    }

    if (competenciaIds.length > 0) {
      await client.query("DELETE FROM competencias WHERE NOT (id = ANY($1::text[]))", [competenciaIds]);
    } else {
      await client.query("DELETE FROM competencias");
    }

    for (const f of data.funcionarios) {
      await client.query(
        `INSERT INTO funcionarios (id, nombre, email, cargo, unidad, color)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
           SET nombre = EXCLUDED.nombre,
               email = EXCLUDED.email,
               cargo = EXCLUDED.cargo,
               unidad = EXCLUDED.unidad,
               color = EXCLUDED.color`,
        [f.id, f.nombre, f.email, f.cargo, f.unidad, f.color],
      );
    }
    for (const c of data.competencias) {
      await client.query(
        `INSERT INTO competencias (id, nombre, unidad)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
           SET nombre = EXCLUDED.nombre,
               unidad = EXCLUDED.unidad`,
        [c.id, c.nombre, c.unidad],
      );
    }
    for (const a of data.actividades) {
      await client.query(
        `INSERT INTO actividades
           (id, tipo, titulo, descripcion, funcionario_id, competencia_id, estado,
            fecha_creacion, plazo_dias, fecha_vencimiento, fecha_cumplimiento,
            observaciones, acciones_pendientes, resultados_alcanzados, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          a.id,
          a.tipo ?? "asignacion",
          a.titulo,
          a.descripcion,
          a.funcionarioId,
          a.competenciaId,
          a.estado,
          a.fechaCreacion,
          a.plazoDias,
          a.fechaVencimiento,
          a.fechaCumplimiento,
          a.observaciones,
          a.accionesPendientes ?? "",
          a.resultadosAlcanzados ?? "",
          a.orden,
        ],
      );

      const participantesIds =
        a.tipo === "reunion"
          ? Array.from(new Set((a.participantesIds ?? []).filter((id) => id && id !== a.funcionarioId)))
          : [];
      for (const funcionarioId of participantesIds) {
        await client.query(
          `INSERT INTO actividad_participantes (actividad_id, funcionario_id)
           VALUES ($1, $2)`,
          [a.id, funcionarioId],
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
