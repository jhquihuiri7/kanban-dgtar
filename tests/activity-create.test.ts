import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityRequestError,
  activityRequestFingerprint,
  normalizeActivityRequest,
  normalizeClientRequestId,
  todayIsoGalapagos,
} from "../lib/activity-create";

function validMeeting(overrides: Record<string, unknown> = {}) {
  return {
    tipo: "reunion",
    titulo: "  Reunión de seguimiento  ",
    descripcion: " Alcance ",
    funcionarioId: "f1",
    participantesIds: ["f3", "f2", "f2"],
    competenciaId: "c1",
    entregableId: null,
    estado: "pendiente",
    fechaCreacion: "2026-07-16",
    fechaInicio: "2026-07-16T09:30",
    fechaFin: "2026-07-16T09:30",
    fechaCumplimiento: null,
    observaciones: "",
    accionesPendientes: " Acción ",
    resultadosAlcanzados: "",
    ...overrides,
  };
}

test("normaliza una clave idempotente válida y rechaza claves débiles", () => {
  assert.equal(normalizeClientRequestId(" req_12345678 "), "req_12345678");
  assert.throws(
    () => normalizeClientRequestId("short"),
    (err) => err instanceof ActivityRequestError && err.status === 400,
  );
  assert.throws(() => normalizeClientRequestId("req con espacios"), ActivityRequestError);
});

test("normaliza texto y participantes de reunión de forma determinista", () => {
  const normalized = normalizeActivityRequest(validMeeting());
  assert.equal(normalized.titulo, "Reunión de seguimiento");
  assert.equal(normalized.descripcion, "Alcance");
  assert.deepEqual(normalized.participantesIds, ["f2", "f3"]);
  assert.equal(normalized.accionesPendientes, "Acción");
});

test("rechaza participantes en asignaciones y fechas inválidas", () => {
  assert.throws(
    () =>
      normalizeActivityRequest(
        validMeeting({
          tipo: "asignacion",
          participantesIds: ["f2"],
          fechaInicio: "2026-07-16",
          fechaFin: "2026-07-23",
        }),
      ),
    (err) => err instanceof ActivityRequestError && err.status === 422,
  );
  assert.throws(
    () =>
      normalizeActivityRequest(
        validMeeting({
          fechaInicio: "2026-02-30T25:99",
          fechaFin: "2026-02-30T25:99",
        }),
      ),
    ActivityRequestError,
  );
});

test("asignaciones aceptan intervalos sin límite de 365 días y exigen orden cronológico", () => {
  const normalized = normalizeActivityRequest(
    validMeeting({
      tipo: "asignacion",
      participantesIds: [],
      fechaInicio: "2020-01-01",
      fechaFin: "2030-01-01",
    }),
  );
  assert.equal(normalized.fechaInicio, "2020-01-01");
  assert.equal(normalized.fechaFin, "2030-01-01");
  assert.throws(
    () =>
      normalizeActivityRequest(
        validMeeting({
          tipo: "asignacion",
          participantesIds: [],
          fechaInicio: "2030-01-02",
          fechaFin: "2030-01-01",
        }),
      ),
    ActivityRequestError,
  );
});

test("reuniones exigen fecha y hora idénticas en inicio y fin", () => {
  assert.throws(
    () => normalizeActivityRequest(validMeeting({ fechaFin: "2026-07-16T10:30" })),
    (error) =>
      error instanceof ActivityRequestError &&
      error.publicMessage.includes("exactamente iguales"),
  );
});

test("el fingerprint no depende del orden de participantes y cambia con el contenido", () => {
  const first = normalizeActivityRequest(validMeeting());
  const reordered = normalizeActivityRequest(validMeeting({ participantesIds: ["f2", "f3"] }));
  const changed = normalizeActivityRequest(validMeeting({ titulo: "Otro título" }));
  const changedDate = normalizeActivityRequest(
    validMeeting({
      fechaInicio: "2026-07-17T09:30",
      fechaFin: "2026-07-17T09:30",
    }),
  );
  assert.equal(activityRequestFingerprint(first, "f1"), activityRequestFingerprint(reordered, "f1"));
  assert.notEqual(activityRequestFingerprint(first, "f1"), activityRequestFingerprint(changed, "f1"));
  assert.notEqual(activityRequestFingerprint(first, "f1"), activityRequestFingerprint(changedDate, "f1"));
});

test("la fecha auditada del servidor usa Pacific/Galapagos", () => {
  assert.equal(todayIsoGalapagos(new Date("2026-07-17T00:30:00.000Z")), "2026-07-16");
});
