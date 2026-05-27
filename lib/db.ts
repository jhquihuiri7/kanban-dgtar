// Server-only PostgreSQL data layer for the Kanban DGTAR app.
// Three tables (funcionarios, competencias, actividades) map 1:1 to the
// entities in `./data`. Connection comes from DATABASE_URL. This module must
// never be imported from client code.

import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import type { Actividad, Competencia, EstadoActividad, Funcionario, Unidad } from "./data";

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
    titulo: r.titulo as string,
    descripcion: r.descripcion as string,
    funcionarioId: r.funcionario_id as string,
    competenciaId: r.competencia_id as string,
    estado: r.estado as EstadoActividad,
    fechaCreacion: r.fecha_creacion as string,
    plazoDias: r.plazo_dias as number,
    fechaVencimiento: r.fecha_vencimiento as string,
    fechaCumplimiento: (r.fecha_cumplimiento as string | null) ?? null,
    observaciones: r.observaciones as string,
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
  const [f, c, a] = await Promise.all([
    db.query("SELECT * FROM funcionarios ORDER BY id"),
    db.query("SELECT * FROM competencias ORDER BY id"),
    db.query("SELECT * FROM actividades ORDER BY orden, id"),
  ]);
  return {
    funcionarios: f.rows.map(mapFuncionario),
    competencias: c.rows.map(mapCompetencia),
    actividades: a.rows.map(mapActividad),
  };
}

// Full-document overwrite inside a transaction. Fine for a single-team
// internal tool (tens of rows); last writer wins, so it is not meant for
// simultaneous editors hitting the same data at once.
export async function writeAll(data: DbData): Promise<void> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Delete children before parents to respect foreign keys.
    await client.query("DELETE FROM actividades");
    await client.query("DELETE FROM competencias");
    await client.query("DELETE FROM funcionarios");

    for (const f of data.funcionarios) {
      await client.query(
        `INSERT INTO funcionarios (id, nombre, email, cargo, unidad, color)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [f.id, f.nombre, f.email, f.cargo, f.unidad, f.color],
      );
    }
    for (const c of data.competencias) {
      await client.query(
        `INSERT INTO competencias (id, nombre, unidad)
         VALUES ($1, $2, $3)`,
        [c.id, c.nombre, c.unidad],
      );
    }
    for (const a of data.actividades) {
      await client.query(
        `INSERT INTO actividades
           (id, titulo, descripcion, funcionario_id, competencia_id, estado,
            fecha_creacion, plazo_dias, fecha_vencimiento, fecha_cumplimiento,
            observaciones, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          a.id,
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
          a.orden,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
