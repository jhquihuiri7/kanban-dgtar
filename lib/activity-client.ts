import type { Actividad } from "./data";

export type ActivityCreationPhase = "saving" | "verifying";
export type ActivityFailureKind =
  | "validation"
  | "network"
  | "server"
  | "authentication"
  | "permission"
  | "timeout"
  | "verification"
  | "conflict";

export type NewActivityPayload = Omit<Actividad, "id" | "orden">;

export class ActivityPersistenceError extends Error {
  constructor(
    readonly kind: ActivityFailureKind,
    message: string,
    readonly code?: string,
    readonly status?: number,
    readonly existingActivity?: Actividad,
  ) {
    super(message);
    this.name = "ActivityPersistenceError";
  }
}

export interface PersistActivityOptions {
  input: NewActivityPayload;
  clientRequestId: string;
  retryAttempt: number;
  onPhase: (phase: ActivityCreationPhase) => void;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  requestId?: string;
  createTimeoutMs?: number;
  verifyTimeoutMs?: number;
  verificationDelaysMs?: readonly number[];
}

interface ApiPayload {
  ok?: boolean;
  verified?: boolean;
  activity?: Actividad;
  error?: string;
  code?: string;
}

interface FetchJsonResult {
  response: Response;
  payload: ApiPayload | null;
}

const DEFAULT_CREATE_TIMEOUT_MS = 15_000;
const DEFAULT_VERIFY_TIMEOUT_MS = 5_000;
export const DEFAULT_VERIFICATION_DELAYS_MS = [0, 300, 800] as const;

function newRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `req_${uuid}` : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function normalizedIds(ids: string[] | undefined): string[] {
  return Array.from(new Set(ids ?? [])).sort();
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

/** Compares user intent and validates server-generated audit dates. */
export function activityFieldMismatches(activity: Actividad, input: NewActivityPayload): string[] {
  const mismatches: string[] = [];
  const same = (field: string, actual: unknown, expected: unknown) => {
    if (actual !== expected) mismatches.push(field);
  };

  if (!activity?.id) mismatches.push("id");
  same("tipo", activity.tipo, input.tipo);
  same("titulo", activity.titulo, input.titulo.trim());
  same("descripcion", activity.descripcion, input.descripcion.trim());
  same("funcionarioId", activity.funcionarioId, input.funcionarioId);
  same("competenciaId", activity.competenciaId, input.competenciaId);
  same("entregableId", activity.entregableId ?? null, input.entregableId ?? null);
  same("estado", activity.estado, input.estado);
  if (!isIsoDate(activity.fechaCreacion)) mismatches.push("fechaCreacion");
  same("fechaInicio", activity.fechaInicio, input.fechaInicio);
  same("fechaFin", activity.fechaFin, input.fechaFin);
  same("observaciones", activity.observaciones, input.observaciones.trim());
  same("accionesPendientes", activity.accionesPendientes, input.accionesPendientes.trim());
  same("resultadosAlcanzados", activity.resultadosAlcanzados, input.resultadosAlcanzados.trim());
  if (JSON.stringify(normalizedIds(activity.participantesIds)) !== JSON.stringify(normalizedIds(input.participantesIds))) {
    mismatches.push("participantesIds");
  }
  if (input.estado === "cumplida") {
    if (!isIsoDate(activity.fechaCumplimiento)) mismatches.push("fechaCumplimiento");
  } else {
    same("fechaCumplimiento", activity.fechaCumplimiento, null);
  }
  return mismatches;
}

export function activityMatchesInput(activity: Actividad, input: NewActivityPayload): boolean {
  return activityFieldMismatches(activity, input).length === 0;
}

export function failureKindForStatus(status: number): ActivityFailureKind {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 409) return "conflict";
  return "server";
}

function publicMessage(kind: ActivityFailureKind, fallback?: string): string {
  if (fallback) return fallback;
  switch (kind) {
    case "validation":
      return "Revisa los datos ingresados e inténtalo nuevamente.";
    case "authentication":
      return "Tu sesión venció. Inicia sesión nuevamente sin borrar este borrador.";
    case "permission":
      return "No tienes permisos para crear esta actividad.";
    case "timeout":
      return "La operación tardó demasiado y no pudo confirmarse.";
    case "network":
      return "No fue posible comunicarse con el servidor.";
    case "conflict":
      return "La clave de esta operación ya fue usada con datos diferentes.";
    case "verification":
      return "El servidor respondió, pero no se pudo confirmar la actividad en la base de datos.";
    default:
      return "El servidor no pudo procesar la actividad.";
  }
}

async function fetchJsonWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as ApiPayload | null;
    return { response, payload };
  } catch (error) {
    if (error instanceof ActivityPersistenceError) throw error;
    if ((error as { name?: string })?.name === "AbortError" || controller.signal.aborted) {
      throw new ActivityPersistenceError("timeout", publicMessage("timeout"));
    }
    throw new ActivityPersistenceError("network", publicMessage("network"));
  } finally {
    clearTimeout(timeout);
  }
}

function httpError(response: Response, payload: ApiPayload | null): ActivityPersistenceError {
  const kind = failureKindForStatus(response.status);
  return new ActivityPersistenceError(
    kind,
    publicMessage(kind, typeof payload?.error === "string" ? payload.error : undefined),
    payload?.code,
    response.status,
  );
}

async function verifyOnce(options: {
  clientRequestId: string;
  requestId: string;
  attempt: number;
  verificationAttempt?: number;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<Actividad | null> {
  const query = new URLSearchParams({ clientRequestId: options.clientRequestId });
  const { response, payload } = await fetchJsonWithTimeout(
    options.fetchImpl,
    `/api/activities/verify?${query.toString()}`,
    {
      method: "GET",
      headers: {
        "X-Request-Id": options.requestId,
        "X-Retry-Attempt": String(options.attempt),
        "X-Verification-Attempt": String(options.verificationAttempt ?? 1),
      },
    },
    options.timeoutMs,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw httpError(response, payload);
  if (payload?.ok !== true || payload.verified !== true || !payload.activity?.id) {
    throw new ActivityPersistenceError("verification", publicMessage("verification"), "INVALID_VERIFY_RESPONSE");
  }
  return payload.activity;
}

function assertMatching(activity: Actividad, input: NewActivityPayload): Actividad {
  const mismatches = activityFieldMismatches(activity, input);
  if (mismatches.length > 0) {
    throw new ActivityPersistenceError(
      "conflict",
      publicMessage("conflict"),
      `IDEMPOTENCY_PAYLOAD_MISMATCH:${mismatches.join(",")}`,
      undefined,
      activity,
    );
  }
  return activity;
}

/**
 * Resolves the whole ambiguous-write protocol. It checks the idempotency key
 * before POST, never trusts the POST alone, and verifies with finite retries.
 */
export async function persistActivityWithVerification(options: PersistActivityOptions): Promise<Actividad> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const requestId = options.requestId ?? newRequestId();
  const createTimeoutMs = options.createTimeoutMs ?? DEFAULT_CREATE_TIMEOUT_MS;
  const verifyTimeoutMs = options.verifyTimeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
  const delays = options.verificationDelaysMs ?? DEFAULT_VERIFICATION_DELAYS_MS;
  const attempt = Math.max(1, Math.trunc(options.retryAttempt) || 1);

  options.onPhase("saving");

  // This preflight makes manual retries safe when the first response was lost.
  const preexisting = await verifyOnce({
    clientRequestId: options.clientRequestId,
    requestId,
    attempt,
    fetchImpl,
    timeoutMs: verifyTimeoutMs,
  });
  if (preexisting) {
    options.onPhase("verifying");
    return assertMatching(preexisting, options.input);
  }

  let ambiguousCreateError: ActivityPersistenceError | null = null;
  try {
    const { response, payload } = await fetchJsonWithTimeout(
      fetchImpl,
      "/api/activities",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
          "X-Retry-Attempt": String(attempt),
        },
        body: JSON.stringify({ clientRequestId: options.clientRequestId, activity: options.input }),
      },
      createTimeoutMs,
    );
    if (!response.ok) throw httpError(response, payload);
    if (payload?.ok !== true || !payload.activity?.id) {
      throw new ActivityPersistenceError("server", publicMessage("server"), "INVALID_CREATE_RESPONSE");
    }
  } catch (error) {
    const persistenceError =
      error instanceof ActivityPersistenceError
        ? error
        : new ActivityPersistenceError("server", publicMessage("server"));
    // Most 4xx responses are definitive. A same-key conflict can race between
    // the preflight GET and POST, so read the key once more to surface the
    // already-saved row (without ever issuing a second POST).
    const verifyConflict =
      persistenceError.kind === "conflict" && persistenceError.code === "IDEMPOTENCY_CONFLICT";
    if (["validation", "authentication", "permission"].includes(persistenceError.kind) ||
        (persistenceError.kind === "conflict" && !verifyConflict)) {
      throw persistenceError;
    }
    ambiguousCreateError = persistenceError;
  }

  options.onPhase("verifying");
  let lastVerificationError: ActivityPersistenceError | null = null;
  for (let index = 0; index < delays.length; index++) {
    if (delays[index] > 0) await sleep(delays[index]);
    try {
      const activity = await verifyOnce({
        clientRequestId: options.clientRequestId,
        requestId,
        attempt,
        verificationAttempt: index + 1,
        fetchImpl,
        timeoutMs: verifyTimeoutMs,
      });
      if (activity) return assertMatching(activity, options.input);
    } catch (error) {
      const persistenceError =
        error instanceof ActivityPersistenceError
          ? error
          : new ActivityPersistenceError("verification", publicMessage("verification"));
      if (["authentication", "permission", "validation", "conflict"].includes(persistenceError.kind)) throw persistenceError;
      lastVerificationError = persistenceError;
    }
  }

  const finalKind: ActivityFailureKind =
    lastVerificationError?.kind ?? ambiguousCreateError?.kind ?? "verification";
  throw new ActivityPersistenceError(
    finalKind,
    publicMessage(finalKind),
    lastVerificationError?.code ?? ambiguousCreateError?.code ?? "ACTIVITY_NOT_VERIFIED",
  );
}
