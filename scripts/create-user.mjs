#!/usr/bin/env node
import { randomBytes, randomUUID, scrypt as scryptCb } from "crypto";
import { readFileSync, existsSync } from "fs";
import { promisify } from "util";
import pg from "pg";

const scrypt = promisify(scryptCb);
const { Pool } = pg;

loadDotEnv();

const [role, email, password, funcionarioId, ...nameParts] = process.argv.slice(2);
const nombre = nameParts.join(" ");
const linkedFuncionarioId = role === "admin" ? null : funcionarioId || null;

if (!["admin", "user"].includes(role) || !email || !password || password.length < 8) {
  console.error("Uso:");
  console.error("  npm run create -- admin admin@dgtar.local \"ClaveSegura123\"");
  console.error("  npm run create -- user user@dgtar.local \"ClaveSegura123\" funcionario_id \"Nombre visible\"");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL. Revisa .env o exporta la variable antes de ejecutar el script.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  await ensureSchema();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO usuarios (id, email, nombre, password_hash, rol, funcionario_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (email) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           password_hash = EXCLUDED.password_hash,
           rol = EXCLUDED.rol,
           funcionario_id = EXCLUDED.funcionario_id,
           updated_at = EXCLUDED.updated_at`,
    [
      randomUUID(),
      email.trim().toLowerCase(),
      nombre || "",
      passwordHash,
      role,
      linkedFuncionarioId,
      now,
    ],
  );
  console.log(`Usuario ${email.trim().toLowerCase()} creado/actualizado con rol ${role}.`);
} finally {
  await pool.end();
}

async function ensureSchema() {
  const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
}

async function hashPassword(rawPassword) {
  const salt = randomBytes(16).toString("base64url");
  const key = await scrypt(rawPassword, salt, 64);
  return `scrypt$${salt}$${Buffer.from(key).toString("base64url")}`;
}

function loadDotEnv() {
  if (!existsSync(".env")) return;
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
