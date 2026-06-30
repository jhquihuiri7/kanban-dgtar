import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ensureSchema, getPool, readAll, type DbData } from "@/lib/db";
import { publicUrl } from "@/lib/public-url";
import {
  ZONE_TZ,
  actividadFuncionarioIds,
  addDays,
  dateOnly,
  fmtHora,
  iso,
  type Actividad,
  type Competencia,
  type Funcionario,
} from "@/lib/data";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CALENDAR_ID = "primary";
const GOOGLE_FETCH_ATTEMPTS = 3;
const GOOGLE_FETCH_TIMEOUT_MS = 20000;

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_SCOPES = ["openid", "email", GOOGLE_CALENDAR_SCOPE];

type Row = Record<string, unknown>;

export interface GoogleConnectionStatus {
  connected: boolean;
  googleEmail: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

interface GoogleSyncAccount {
  userId: string;
  appEmail: string;
  funcionarioId: string | null;
  googleEmail: string;
  refreshTokenEncrypted: string;
}

interface EventMapping {
  actividadId: string;
  googleEventId: string;
  lastPayloadHash: string;
  lastError: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface UserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
}

export interface GoogleSyncSummary {
  synced: number;
  failed: number;
  errors: { userId: string; message: string }[];
}

interface SyncOptions {
  userIds?: string[];
  force?: boolean;
}

class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

function googleClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID;
  if (!value) throw new Error("Falta GOOGLE_CLIENT_ID en el entorno.");
  return value;
}

function googleClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error("Falta GOOGLE_CLIENT_SECRET en el entorno.");
  return value;
}

function googleRedirectUri(req?: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  if (!req) throw new Error("Falta GOOGLE_REDIRECT_URI o APP_PUBLIC_URL para construir el callback.");
  return publicUrl(req, "/api/google/callback").toString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorMessage(err: unknown): string {
  if (err instanceof GoogleApiError) {
    const body = err.body ? `: ${err.body.slice(0, 500)}` : "";
    return `${err.message}${body}`;
  }
  return err instanceof Error ? err.message : "Error desconocido";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableGoogleStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchGoogle(url: string, init: RequestInit, context: string): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= GOOGLE_FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOOGLE_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      if (!retryableGoogleStatus(res.status) || attempt === GOOGLE_FETCH_ATTEMPTS) {
        return res;
      }

      lastError = new GoogleApiError(`${context} respondio ${res.status}`, res.status, await res.clone().text());
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (attempt === GOOGLE_FETCH_ATTEMPTS) break;
    }

    await sleep(600 * attempt);
  }

  throw new Error(`${context} fallo tras ${GOOGLE_FETCH_ATTEMPTS} intento(s): ${errorMessage(lastError)}`);
}

function tokenKey(): Buffer {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta GOOGLE_TOKEN_ENCRYPTION_KEY o AUTH_SECRET para cifrar tokens.");
  return createHash("sha256").update(secret).digest();
}

function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptToken(value: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Token de Google guardado con formato invalido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function deterministicEventId(userId: string, actividadId: string): string {
  return `kdb${createHash("sha256").update(`${userId}:${actividadId}`).digest("hex")}`;
}

function defaultDurationMinutes(): number {
  const raw = Number(process.env.GOOGLE_DEFAULT_EVENT_DURATION_MINUTES || 60);
  if (!Number.isFinite(raw)) return 60;
  return Math.min(1440, Math.max(15, Math.round(raw)));
}

function addLocalMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  return {
    date: iso(d),
    time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function appSourceUrl(): string | null {
  const raw = process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function estadoLabel(estado: string): string {
  return (
    {
      pendiente: "Pendiente",
      en_progreso: "En progreso",
      en_revision: "En revision",
      cumplida: "Cumplida",
      archivada: "Archivada",
    } as Record<string, string>
  )[estado] || estado;
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function funcionarioIdsForAccount(account: GoogleSyncAccount, funcionarios: Funcionario[]): Set<string> {
  const ids = new Set<string>();
  if (account.funcionarioId) ids.add(account.funcionarioId);

  const emails = new Set(
    [account.appEmail, account.googleEmail].map(normalizeEmail).filter(Boolean),
  );
  for (const funcionario of funcionarios) {
    if (emails.has(normalizeEmail(funcionario.email))) ids.add(funcionario.id);
  }
  return ids;
}

function visibleForFuncionarioIds(funcionarioIds: Set<string>, activity: Actividad): boolean {
  if (funcionarioIds.size === 0) return false;
  return actividadFuncionarioIds(activity).some((id) => funcionarioIds.has(id));
}

function buildDescription(
  activity: Actividad,
  funcionarios: Funcionario[],
  competencias: Competencia[],
): string {
  const responsable = funcionarios.find((f) => f.id === activity.funcionarioId);
  const participantes = (activity.participantesIds ?? [])
    .map((id) => funcionarios.find((f) => f.id === id)?.nombre)
    .filter(Boolean)
    .join(", ");
  const competencia = competencias.find((c) => c.id === activity.competenciaId);
  const lines = [
    "Actividad sincronizada desde Kanban DGTAR.",
    "",
    activity.descripcion.trim(),
    "",
    `Tipo: ${activity.tipo === "reunion" ? "Reunion" : "Asignacion"}`,
    `Estado: ${estadoLabel(activity.estado)}`,
    responsable ? `Responsable: ${responsable.nombre}` : "",
    participantes ? `Participantes: ${participantes}` : "",
    competencia ? `Competencia: ${competencia.nombre} (${competencia.unidad})` : "",
    activity.accionesPendientes ? `Acciones pendientes: ${activity.accionesPendientes}` : "",
    activity.resultadosAlcanzados ? `Resultados alcanzados: ${activity.resultadosAlcanzados}` : "",
    activity.observaciones ? `Observaciones: ${activity.observaciones}` : "",
  ];
  return lines.filter((line, index) => line || index < 4).join("\n").trim();
}

function buildGoogleEvent(
  account: GoogleSyncAccount,
  activity: Actividad,
  data: DbData,
): Record<string, unknown> {
  const description = buildDescription(activity, data.funcionarios, data.competencias);
  const sourceUrl = appSourceUrl();
  const base = {
    summary: activity.titulo,
    description,
    extendedProperties: {
      private: {
        kanbanActivityId: activity.id,
        kanbanUserId: account.userId,
        source: "kanban-dgtar",
      },
    },
    ...(sourceUrl ? { source: { title: "Kanban DGTAR", url: sourceUrl } } : {}),
  };

  if (activity.tipo === "reunion") {
    const fecha = dateOnly(activity.fechaVencimiento);
    const hora = fmtHora(activity.fechaVencimiento) || "09:00";
    const end = addLocalMinutes(fecha, hora, defaultDurationMinutes());
    return {
      ...base,
      transparency: "opaque",
      start: { dateTime: `${fecha}T${hora}:00`, timeZone: ZONE_TZ },
      end: { dateTime: `${end.date}T${end.time}:00`, timeZone: ZONE_TZ },
    };
  }

  const fecha = dateOnly(activity.fechaVencimiento);
  return {
    ...base,
    transparency: "transparent",
    start: { date: fecha },
    end: { date: iso(addDays(fecha, 1)) },
  };
}

function decodeJwtPayload(token: string | undefined): UserInfoResponse {
  if (!token) return {};
  const [, payload] = token.split(".");
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UserInfoResponse;
  } catch {
    return {};
  }
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetchGoogle(url, init, "Google API");
  const text = await res.text();
  if (!res.ok) {
    throw new GoogleApiError(`Google API respondio ${res.status}`, res.status, text);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function exchangeCode(req: Request, code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: googleRedirectUri(req),
    grant_type: "authorization_code",
  });
  const token = await fetchJson<TokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!token.access_token) throw new Error(token.error_description || token.error || "Google no devolvio access_token.");
  return token;
}

async function refreshAccessToken(account: GoogleSyncAccount): Promise<string> {
  const refreshToken = decryptToken(account.refreshTokenEncrypted);
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const token = await fetchJson<TokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!token.access_token) throw new Error(token.error_description || token.error || "Google no devolvio access_token.");
  return token.access_token;
}

async function fetchUserInfo(accessToken: string): Promise<UserInfoResponse> {
  return fetchJson<UserInfoResponse>(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function googleCalendarRequest(
  accessToken: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<void> {
  const res = await fetchGoogle(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }, "Google Calendar");
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(`Google Calendar respondio ${res.status}`, res.status, text);
}

async function insertGoogleEvent(accessToken: string, eventId: string, payload: Record<string, unknown>) {
  const url = `${GOOGLE_CALENDAR_API}/calendars/${GOOGLE_CALENDAR_ID}/events`;
  await googleCalendarRequest(accessToken, "POST", url, { id: eventId, ...payload });
}

async function patchGoogleEvent(accessToken: string, eventId: string, payload: Record<string, unknown>) {
  const url = `${GOOGLE_CALENDAR_API}/calendars/${GOOGLE_CALENDAR_ID}/events/${encodeURIComponent(eventId)}`;
  await googleCalendarRequest(accessToken, "PATCH", url, payload);
}

async function deleteGoogleEvent(accessToken: string, eventId: string) {
  const url = `${GOOGLE_CALENDAR_API}/calendars/${GOOGLE_CALENDAR_ID}/events/${encodeURIComponent(eventId)}`;
  try {
    await googleCalendarRequest(accessToken, "DELETE", url);
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}

async function upsertGoogleEvent(
  accessToken: string,
  eventId: string,
  payload: Record<string, unknown>,
  hasMapping: boolean,
) {
  if (hasMapping) {
    try {
      await patchGoogleEvent(accessToken, eventId, payload);
      return;
    } catch (err) {
      if (!(err instanceof GoogleApiError) || err.status !== 404) throw err;
    }
  }

  try {
    await insertGoogleEvent(accessToken, eventId, payload);
  } catch (err) {
    if (err instanceof GoogleApiError && err.status === 409) {
      await patchGoogleEvent(accessToken, eventId, payload);
      return;
    }
    throw err;
  }
}

function mapAccount(row: Row): GoogleSyncAccount {
  return {
    userId: row.user_id as string,
    appEmail: row.app_email as string,
    funcionarioId: (row.funcionario_id as string | null) ?? null,
    googleEmail: row.google_email as string,
    refreshTokenEncrypted: row.refresh_token_encrypted as string,
  };
}

async function listGoogleAccounts(userIds?: string[]): Promise<GoogleSyncAccount[]> {
  await ensureSchema();
  const params: unknown[] = [];
  const where = userIds?.length ? "WHERE ga.user_id = ANY($1::text[])" : "";
  if (userIds?.length) params.push(userIds);
  const result = await getPool().query(
    `SELECT ga.user_id, ga.google_email, ga.refresh_token_encrypted,
            u.email AS app_email, u.funcionario_id
     FROM google_accounts ga
     JOIN usuarios u ON u.id = ga.user_id
     ${where}
     ORDER BY ga.user_id`,
    params,
  );
  return result.rows.map(mapAccount);
}

async function listEventMappings(userId: string): Promise<Map<string, EventMapping>> {
  const result = await getPool().query(
    `SELECT actividad_id, google_event_id, last_payload_hash, last_error
     FROM actividad_google_events
     WHERE user_id = $1`,
    [userId],
  );
  return new Map(
    result.rows.map((row) => [
      row.actividad_id as string,
      {
        actividadId: row.actividad_id as string,
        googleEventId: row.google_event_id as string,
        lastPayloadHash: (row.last_payload_hash as string) || "",
        lastError: (row.last_error as string) || "",
      },
    ]),
  );
}

async function upsertEventMapping(input: {
  userId: string;
  actividadId: string;
  googleEventId: string;
  hash: string;
  error?: string;
}) {
  const now = nowIso();
  await getPool().query(
    `INSERT INTO actividad_google_events
       (user_id, actividad_id, google_event_id, calendar_id, last_payload_hash,
        last_synced_at, last_error, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $6)
     ON CONFLICT (user_id, actividad_id) DO UPDATE
       SET google_event_id = EXCLUDED.google_event_id,
           calendar_id = EXCLUDED.calendar_id,
           last_payload_hash = EXCLUDED.last_payload_hash,
           last_synced_at = EXCLUDED.last_synced_at,
           last_error = EXCLUDED.last_error,
           updated_at = EXCLUDED.updated_at`,
    [
      input.userId,
      input.actividadId,
      input.googleEventId,
      GOOGLE_CALENDAR_ID,
      input.hash,
      now,
      input.error || "",
    ],
  );
}

async function deleteEventMapping(userId: string, actividadId: string) {
  await getPool().query(
    "DELETE FROM actividad_google_events WHERE user_id = $1 AND actividad_id = $2",
    [userId, actividadId],
  );
}

async function updateAccountSyncState(userId: string, error: string | null) {
  await getPool().query(
    `UPDATE google_accounts
     SET last_synced_at = $2, last_error = $3, updated_at = $2
     WHERE user_id = $1`,
    [userId, nowIso(), error || ""],
  );
}

async function syncAccount(
  account: GoogleSyncAccount,
  _previous: DbData,
  next: DbData,
  force: boolean,
): Promise<{ failed: number }> {
  const accessToken = await refreshAccessToken(account);
  const mappings = await listEventMappings(account.userId);
  const funcionarioIds = funcionarioIdsForAccount(account, next.funcionarios);
  const visibleActivities = next.actividades.filter((activity) =>
    visibleForFuncionarioIds(funcionarioIds, activity),
  );
  const nextById = new Map(visibleActivities.map((activity) => [activity.id, activity]));
  let failed = 0;

  for (const mapping of Array.from(mappings.values())) {
    if (nextById.has(mapping.actividadId)) continue;
    try {
      await deleteGoogleEvent(accessToken, mapping.googleEventId);
      await deleteEventMapping(account.userId, mapping.actividadId);
    } catch (err) {
      failed++;
      await upsertEventMapping({
        userId: account.userId,
        actividadId: mapping.actividadId,
        googleEventId: mapping.googleEventId,
        hash: mapping.lastPayloadHash,
        error: errorMessage(err),
      });
    }
  }

  for (const activity of visibleActivities) {
    const payload = buildGoogleEvent(account, activity, next);
    const hash = payloadHash(payload);
    const mapping = mappings.get(activity.id);
    if (!force && mapping?.lastPayloadHash === hash && !mapping.lastError) continue;

    const googleEventId = mapping?.googleEventId || deterministicEventId(account.userId, activity.id);
    try {
      await upsertGoogleEvent(accessToken, googleEventId, payload, Boolean(mapping));
      await upsertEventMapping({
        userId: account.userId,
        actividadId: activity.id,
        googleEventId,
        hash,
      });
    } catch (err) {
      failed++;
      await upsertEventMapping({
        userId: account.userId,
        actividadId: activity.id,
        googleEventId,
        hash,
        error: errorMessage(err),
      });
    }
  }

  await updateAccountSyncState(
    account.userId,
    failed ? `${failed} evento(s) no se pudieron sincronizar.` : null,
  );
  return { failed };
}

export async function createGoogleAuthUrl(req: Request, userId: string): Promise<string> {
  await ensureSchema();
  const state = randomBytes(32).toString("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();
  await getPool().query(
    `INSERT INTO google_oauth_states (state, user_id, return_to, expires_at, created_at)
     VALUES ($1, $2, '/', $3, $4)`,
    [state, userId, expiresAt, createdAt],
  );

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", googleRedirectUri(req));
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function consumeOAuthState(state: string, userId: string) {
  await ensureSchema();
  const now = nowIso();
  await getPool().query("DELETE FROM google_oauth_states WHERE expires_at < $1", [now]);
  const result = await getPool().query(
    `DELETE FROM google_oauth_states
     WHERE state = $1
     RETURNING user_id, expires_at`,
    [state],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Estado OAuth invalido o expirado.");
  if (row.user_id !== userId) throw new Error("Estado OAuth no pertenece al usuario actual.");
}

async function existingEncryptedRefreshToken(userId: string): Promise<string | null> {
  const result = await getPool().query(
    "SELECT refresh_token_encrypted FROM google_accounts WHERE user_id = $1",
    [userId],
  );
  return (result.rows[0]?.refresh_token_encrypted as string | undefined) || null;
}

export async function connectGoogleAccount(req: Request, userId: string, code: string, state: string) {
  await consumeOAuthState(state, userId);
  const token = await exchangeCode(req, code);
  const existingRefresh = await existingEncryptedRefreshToken(userId);
  const encryptedRefresh = token.refresh_token ? encryptToken(token.refresh_token) : existingRefresh;
  if (!encryptedRefresh) {
    throw new Error("Google no devolvio refresh_token. Intenta vincular de nuevo y acepta el consentimiento.");
  }

  let userInfo: UserInfoResponse = {};
  try {
    userInfo = await fetchUserInfo(token.access_token!);
  } catch {
    userInfo = decodeJwtPayload(token.id_token);
  }

  const now = nowIso();
  await getPool().query(
    `INSERT INTO google_accounts
       (user_id, google_email, google_subject, refresh_token_encrypted, scope,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (user_id) DO UPDATE
       SET google_email = EXCLUDED.google_email,
           google_subject = EXCLUDED.google_subject,
           refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
           scope = EXCLUDED.scope,
           last_error = '',
           updated_at = EXCLUDED.updated_at`,
    [
      userId,
      userInfo.email || "",
      userInfo.sub || "",
      encryptedRefresh,
      token.scope || GOOGLE_SCOPES.join(" "),
      now,
    ],
  );

  const data = await readAll();
  await syncGoogleCalendars({ funcionarios: [], competencias: [], actividades: [] }, data, {
    userIds: [userId],
    force: true,
  });
}

export async function getGoogleConnectionStatus(userId: string): Promise<GoogleConnectionStatus> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT google_email, last_synced_at, last_error
     FROM google_accounts
     WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    return { connected: false, googleEmail: null, lastSyncedAt: null, lastError: null };
  }
  return {
    connected: true,
    googleEmail: (row.google_email as string) || null,
    lastSyncedAt: (row.last_synced_at as string | null) ?? null,
    lastError: (row.last_error as string) || null,
  };
}

export async function disconnectGoogleAccount(userId: string): Promise<void> {
  await ensureSchema();
  const encryptedRefresh = await existingEncryptedRefreshToken(userId);
  if (encryptedRefresh) {
    try {
      const token = decryptToken(encryptedRefresh);
      await fetch(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch (err) {
      console.warn("[google] revoke failed", err);
    }
  }
  await getPool().query("DELETE FROM actividad_google_events WHERE user_id = $1", [userId]);
  await getPool().query("DELETE FROM google_accounts WHERE user_id = $1", [userId]);
}

export async function syncGoogleCalendars(
  previous: DbData,
  next: DbData,
  options: SyncOptions = {},
): Promise<GoogleSyncSummary> {
  const accounts = await listGoogleAccounts(options.userIds);
  const summary: GoogleSyncSummary = { synced: 0, failed: 0, errors: [] };
  if (accounts.length === 0) return summary;

  for (const account of accounts) {
    try {
      const result = await syncAccount(account, previous, next, Boolean(options.force));
      summary.synced++;
      summary.failed += result.failed;
    } catch (err) {
      const message = errorMessage(err);
      summary.failed++;
      summary.errors.push({ userId: account.userId, message });
      await updateAccountSyncState(account.userId, message);
    }
  }
  return summary;
}

export async function syncCurrentUserGoogleCalendar(userId: string): Promise<GoogleSyncSummary> {
  const data = await readAll();
  return syncGoogleCalendars({ funcionarios: [], competencias: [], actividades: [] }, data, {
    userIds: [userId],
    force: true,
  });
}
