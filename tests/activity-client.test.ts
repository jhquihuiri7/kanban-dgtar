import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityPersistenceError,
  activityFieldMismatches,
  activityMatchesInput,
  failureKindForStatus,
  persistActivityWithVerification,
  type NewActivityPayload,
} from "../lib/activity-client";
import type { Actividad } from "../lib/data";

const input: NewActivityPayload = {
  tipo: "asignacion",
  titulo: "Informe trimestral",
  descripcion: "Detalle",
  funcionarioId: "f1",
  participantesIds: [],
  competenciaId: "c1",
  entregableId: null,
  estado: "pendiente",
  fechaCreacion: "2026-07-16",
  fechaInicio: "2026-07-16",
  fechaFin: "2026-07-23",
  fechaCumplimiento: null,
  observaciones: "",
  accionesPendientes: "Revisar",
  resultadosAlcanzados: "",
};

const activity: Actividad = { id: "a_server", orden: 1, ...input };

function response(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type QueuedItem = Response | Error | ((url: string, init?: RequestInit) => Promise<Response> | Response);

function queueFetch(items: QueuedItem[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (resource: URL | RequestInfo, init?: RequestInit) => {
    const url = String(resource);
    calls.push({ url, init });
    const item = items.shift();
    if (!item) throw new Error(`Unexpected fetch: ${url}`);
    if (item instanceof Error) throw item;
    return typeof item === "function" ? item(url, init) : item;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function notFound(): Response {
  return response(404, { ok: false, verified: false, code: "ACTIVITY_NOT_FOUND" });
}

function found(value: Actividad = activity): Response {
  return response(200, { ok: true, verified: true, activity: value });
}

function created(): Response {
  return response(201, { ok: true, activity });
}

function options(fetchImpl: typeof fetch, overrides: Partial<Parameters<typeof persistActivityWithVerification>[0]> = {}) {
  return {
    input,
    clientRequestId: "activity_request_12345678",
    retryAttempt: 1,
    onPhase: () => undefined,
    fetchImpl,
    sleep: async () => undefined,
    requestId: "req_test_12345678",
    verificationDelaysMs: [0, 0, 0],
    ...overrides,
  };
}

test("creates, then trusts only the direct verification read", async () => {
  const phases: string[] = [];
  const mock = queueFetch([notFound(), created(), found()]);
  const result = await persistActivityWithVerification(
    options(mock.fetchImpl, { onPhase: (phase) => phases.push(phase) }),
  );
  assert.equal(result.id, activity.id);
  assert.deepEqual(phases, ["saving", "verifying"]);
  assert.equal(mock.calls[1].init?.method, "POST");
  assert.match(mock.calls[2].url, /\/verify\?/);
});

test("retries verification finitely when the first read cannot see the row", async () => {
  const sleeps: number[] = [];
  const mock = queueFetch([notFound(), created(), notFound(), found()]);
  const result = await persistActivityWithVerification(
    options(mock.fetchImpl, {
      verificationDelaysMs: [0, 25, 50],
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    }),
  );
  assert.equal(result.id, activity.id);
  assert.deepEqual(sleeps, [25]);
});

test("never reports success when all persistence verification reads are missing", async () => {
  const mock = queueFetch([notFound(), created(), notFound(), notFound(), notFound()]);
  await assert.rejects(
    persistActivityWithVerification(options(mock.fetchImpl)),
    (error) => error instanceof ActivityPersistenceError && error.kind === "verification",
  );
  assert.equal(mock.calls.length, 5);
});

test("recovers when the create response is lost after PostgreSQL committed", async () => {
  const mock = queueFetch([notFound(), new TypeError("connection reset"), found()]);
  const result = await persistActivityWithVerification(options(mock.fetchImpl));
  assert.equal(result.id, activity.id);
  assert.equal(mock.calls.filter((call) => call.init?.method === "POST").length, 1);
});

test("manual retry checks the same idempotency key before creating again", async () => {
  const mock = queueFetch([found()]);
  const result = await persistActivityWithVerification(options(mock.fetchImpl, { retryAttempt: 2 }));
  assert.equal(result.id, activity.id);
  assert.equal(mock.calls.length, 1);
  assert.match(mock.calls[0].url, /clientRequestId=activity_request_12345678/);
  assert.equal(mock.calls[0].init?.headers && (mock.calls[0].init.headers as Record<string, string>)["X-Retry-Attempt"], "2");
});

test("same key with different persisted fields is rejected without another POST", async () => {
  const mock = queueFetch([found({ ...activity, titulo: "Otro contenido" })]);
  await assert.rejects(
    persistActivityWithVerification(options(mock.fetchImpl)),
    (error) =>
      error instanceof ActivityPersistenceError &&
      error.kind === "conflict" &&
      error.existingActivity?.id === activity.id,
  );
  assert.equal(mock.calls.length, 1);
});

test("a POST idempotency race verifies and exposes the already-saved row", async () => {
  const existing = { ...activity, titulo: "Versión de la otra pestaña" };
  const mock = queueFetch([
    notFound(),
    response(409, { ok: false, error: "Clave utilizada", code: "IDEMPOTENCY_CONFLICT" }),
    found(existing),
  ]);
  await assert.rejects(
    persistActivityWithVerification(options(mock.fetchImpl)),
    (error) =>
      error instanceof ActivityPersistenceError &&
      error.kind === "conflict" &&
      error.existingActivity?.id === existing.id,
  );
  assert.equal(mock.calls.filter((call) => call.init?.method === "POST").length, 1);
});

test("the server-generated creation date may differ from the client clock", () => {
  const nextDayActivity: Actividad = {
    ...activity,
    fechaCreacion: "2026-07-17",
  };
  assert.equal(activityMatchesInput(nextDayActivity, input), true);
});

test("meeting verification checks the identical selected start and end datetime", () => {
  const meetingInput: NewActivityPayload = {
    ...input,
    tipo: "reunion",
    fechaInicio: "2026-07-23T09:00",
    fechaFin: "2026-07-23T09:00",
  };
  const meeting: Actividad = { id: "a_meeting_server_date", orden: 2, ...meetingInput };
  assert.equal(activityMatchesInput(meeting, meetingInput), true);
  assert.equal(activityMatchesInput({ ...meeting, fechaFin: "2026-07-23T10:00" }, meetingInput), false);
});

test("validation, authentication, permission and idempotency conflicts stay distinguishable", async () => {
  const cases = [
    { status: 422, kind: "validation" },
    { status: 401, kind: "authentication" },
    { status: 403, kind: "permission" },
    { status: 409, kind: "conflict" },
  ] as const;
  for (const item of cases) {
    const mock = queueFetch([
      notFound(),
      response(item.status, { ok: false, error: `error-${item.status}`, code: "TEST" }),
    ]);
    await assert.rejects(
      persistActivityWithVerification(options(mock.fetchImpl)),
      (error) => error instanceof ActivityPersistenceError && error.kind === item.kind && error.status === item.status,
    );
    assert.equal(mock.calls.length, 2);
  }
});

test("a connection failure before the preflight send is classified as network and does not POST", async () => {
  const mock = queueFetch([new TypeError("offline")]);
  await assert.rejects(
    persistActivityWithVerification(options(mock.fetchImpl)),
    (error) => error instanceof ActivityPersistenceError && error.kind === "network",
  );
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].init?.method, "GET");
});

test("a create timeout performs verification and remains timeout if no row can be confirmed", async () => {
  const abortingFetch = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  const mock = queueFetch([
    notFound(),
    abortingFetch,
    notFound(),
    notFound(),
    notFound(),
  ]);
  await assert.rejects(
    persistActivityWithVerification(options(mock.fetchImpl, { createTimeoutMs: 1 })),
    (error) => error instanceof ActivityPersistenceError && error.kind === "timeout",
  );
});

test("a server failure during creation stays distinguishable after negative verification", async () => {
  const mock = queueFetch([
    notFound(),
    response(503, { ok: false, code: "DATABASE_UNAVAILABLE" }),
    notFound(),
    notFound(),
    notFound(),
  ]);
  await assert.rejects(
    persistActivityWithVerification(options(mock.fetchImpl)),
    (error) => error instanceof ActivityPersistenceError && error.kind === "server",
  );
});

test("a timeout during every verification read is classified separately and stops after three attempts", async () => {
  const abortingFetch = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  const mock = queueFetch([notFound(), created(), abortingFetch, abortingFetch, abortingFetch]);
  await assert.rejects(
    persistActivityWithVerification(
      options(mock.fetchImpl, { verifyTimeoutMs: 1, verificationDelaysMs: [0, 0, 0] }),
    ),
    (error) => error instanceof ActivityPersistenceError && error.kind === "timeout",
  );
  assert.equal(mock.calls.filter((call) => call.url.includes("/verify?")).length, 4);
});

test("optional empty fields and unordered participants compare canonically", () => {
  const meetingInput: NewActivityPayload = {
    ...input,
    tipo: "reunion",
    participantesIds: ["f3", "f2"],
    entregableId: null,
    fechaInicio: "2026-07-23T09:00",
    fechaFin: "2026-07-23T09:00",
  };
  const meeting: Actividad = {
    id: "a_meeting",
    orden: 2,
    ...meetingInput,
    participantesIds: ["f2", "f3", "f2"],
  };
  assert.equal(activityMatchesInput(meeting, meetingInput), true);
  assert.deepEqual(activityFieldMismatches({ ...meeting, competenciaId: "c2" }, meetingInput), ["competenciaId"]);
});

test("assignment verification compares participants with the same canonical rules", () => {
  const assignmentInput: NewActivityPayload = {
    ...input,
    participantesIds: ["f3", "f2"],
  };
  const assignment: Actividad = {
    id: "a_assignment_with_participants",
    orden: 3,
    ...assignmentInput,
    participantesIds: ["f2", "f3", "f2"],
  };
  assert.equal(activityMatchesInput(assignment, assignmentInput), true);
  assert.deepEqual(
    activityFieldMismatches({ ...assignment, participantesIds: ["f2"] }, assignmentInput),
    ["participantesIds"],
  );
});

test("status classification is stable for UI error handling", () => {
  assert.equal(failureKindForStatus(400), "validation");
  assert.equal(failureKindForStatus(401), "authentication");
  assert.equal(failureKindForStatus(403), "permission");
  assert.equal(failureKindForStatus(409), "conflict");
  assert.equal(failureKindForStatus(503), "server");
});
