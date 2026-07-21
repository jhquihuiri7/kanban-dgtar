import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { getPool, ensureSchema } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  type AuthUser,
  type UserRole,
} from "@/lib/auth-token";

const scrypt = promisify(scryptCb);

export interface ManagedUser extends AuthUser {
  funcionarioNombre: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapAuthUser(row: Row): AuthUser {
  return {
    id: row.id as string,
    email: row.email as string,
    nombre: (row.nombre as string) || "",
    role: row.rol as UserRole,
    funcionarioId: (row.funcionario_id as string | null) ?? null,
  };
}

function mapManagedUser(row: Row): ManagedUser {
  return {
    ...mapAuthUser(row),
    funcionarioNombre: (row.funcionario_nombre as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) return null;
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, email, nombre, rol, funcionario_id
     FROM usuarios
     WHERE id = $1`,
    [session.id],
  );
  return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("No autorizado");
  return user;
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, email, nombre, rol, funcionario_id, password_hash
     FROM usuarios
     WHERE email = $1`,
    [normalizeEmail(email)],
  );
  const row = result.rows[0];
  if (!row) return null;
  const ok = await verifyPassword(password, row.password_hash);
  return ok ? mapAuthUser(row) : null;
}

export async function createLoginToken(user: AuthUser): Promise<string> {
  return createSessionToken(user);
}

export async function listUsers(): Promise<ManagedUser[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT u.id, u.email, u.nombre, u.rol, u.funcionario_id, u.created_at, u.updated_at,
            f.nombre AS funcionario_nombre
     FROM usuarios u
     LEFT JOIN funcionarios f ON f.id = u.funcionario_id
     ORDER BY u.rol, u.email`,
  );
  return result.rows.map(mapManagedUser);
}

export async function createUser(input: {
  email: string;
  password: string;
  role: UserRole;
  nombre?: string;
  funcionarioId?: string | null;
}): Promise<ManagedUser> {
  await ensureSchema();
  const now = new Date().toISOString();
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  const funcionarioId = input.funcionarioId || null;
  const result = await getPool().query(
    `INSERT INTO usuarios (id, email, nombre, password_hash, rol, funcionario_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING id, email, nombre, rol, funcionario_id, created_at, updated_at,
       (SELECT nombre FROM funcionarios WHERE funcionarios.id = usuarios.funcionario_id) AS funcionario_nombre`,
    [
      id,
      normalizeEmail(input.email),
      input.nombre?.trim() || "",
      passwordHash,
      input.role,
      funcionarioId,
      now,
    ],
  );
  return mapManagedUser(result.rows[0]);
}

export async function updateUser(
  id: string,
  input: {
    email: string;
    role: UserRole;
    nombre?: string;
    funcionarioId?: string | null;
    password?: string;
  },
): Promise<ManagedUser> {
  await ensureSchema();
  const now = new Date().toISOString();
  const funcionarioId = input.funcionarioId || null;
  const passwordHash = input.password?.trim() ? await hashPassword(input.password) : null;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT revision FROM data_revision WHERE id = 1 FOR UPDATE");
    const previousResult = await client.query(
      "SELECT rol, funcionario_id FROM usuarios WHERE id = $1 FOR UPDATE",
      [id],
    );
    const previous = previousResult.rows[0];
    if (!previous) throw new Error("Usuario no encontrado.");

    const result = await client.query(
      `UPDATE usuarios
       SET email = $2,
           nombre = $3,
           rol = $4,
           funcionario_id = $5,
           password_hash = COALESCE($6, password_hash),
           updated_at = $7
       WHERE id = $1
       RETURNING id, email, nombre, rol, funcionario_id, created_at, updated_at,
         (SELECT nombre FROM funcionarios WHERE funcionarios.id = usuarios.funcionario_id) AS funcionario_nombre`,
      [
        id,
        normalizeEmail(input.email),
        input.nombre?.trim() || "",
        input.role,
        funcionarioId,
        passwordHash,
        now,
      ],
    );

    if (
      previous.rol !== input.role ||
      ((previous.funcionario_id as string | null) ?? null) !== funcionarioId
    ) {
      await client.query(
        "UPDATE data_revision SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      );
    }
    await client.query("COMMIT");
    return mapManagedUser(result.rows[0]);
  } catch (error) {
    await rollbackAuthMutation(client, "update_user");
    throw error;
  } finally {
    client.release();
  }
}

async function rollbackAuthMutation(client: import("pg").PoolClient, operation: string): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("[auth] No se pudo revertir una mutación de usuario", {
      operation,
      errorType: rollbackError instanceof Error ? rollbackError.name : typeof rollbackError,
    });
  }
}

export async function deleteUser(id: string): Promise<void> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Keep the same lock order as activity POST/writeAll. Deleting a user
    // updates activity/ledger FKs, so doing it outside this serialization point
    // could deadlock with the legacy delete-and-reinsert transaction.
    await client.query("SELECT revision FROM data_revision WHERE id = 1 FOR UPDATE");
    const result = await client.query("DELETE FROM usuarios WHERE id = $1", [id]);
    if (result.rowCount) {
      await client.query(
        "UPDATE data_revision SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await rollbackAuthMutation(client, "delete_user");
    throw error;
  } finally {
    client.release();
  }
}

function resetTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordReset(email: string): Promise<string | null> {
  await ensureSchema();
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  const result = await getPool().query(
    `UPDATE usuarios
     SET reset_token_hash = $2, reset_expires_at = $3, updated_at = $4
     WHERE email = $1
     RETURNING id`,
    [normalizeEmail(email), resetTokenHash(token), expires, now],
  );
  return result.rowCount ? token : null;
}

export async function resetPassword(token: string, password: string): Promise<boolean> {
  await ensureSchema();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const result = await getPool().query(
    `UPDATE usuarios
     SET password_hash = $3, reset_token_hash = NULL, reset_expires_at = NULL, updated_at = $4
     WHERE reset_token_hash = $1 AND reset_expires_at >= $2`,
    [resetTokenHash(token), now, passwordHash, now],
  );
  return Boolean(result.rowCount);
}
