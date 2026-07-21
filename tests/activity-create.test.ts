import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityRequestError,
  activityRequestFingerprint,
  addIsoDays,
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
    plazoDias: 0,
    fechaCreacion: "2026-07-16",
    fechaVencimiento: "2026-07-16T09:30",
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

test("rechaza participantes en asignaciones e intervalos inválidos", () => {
  assert.throws(
    () =>
      normalizeActivityRequest(
        validMeeting({
          tipo: "asignacion",
          participantesIds: ["f2"],
          plazoDias: 7,
          fechaVencimiento: "2026-07-23",
        }),
      ),
    (err) => err instanceof ActivityRequestError && err.status === 422,
  );
  assert.throws(
    () => normalizeActivityRequest(validMeeting({ fechaVencimiento: "2026-02-30T25:99" })),
    ActivityRequestError,
  );
});

test("el fingerprint no depende del orden de participantes y cambia con el contenido", () => {
  const first = normalizeActivityRequest(validMeeting());
  const reordered = normalizeActivityRequest(validMeeting({ participantesIds: ["f2", "f3"] }));
  const changed = normalizeActivityRequest(validMeeting({ titulo: "Otro título" }));
  assert.equal(activityRequestFingerprint(first, "f1"), activityRequestFingerprint(reordered, "f1"));
  assert.notEqual(activityRequestFingerprint(first, "f1"), activityRequestFingerprint(changed, "f1"));
});

test("la fecha del servidor usa Pacific/Galapagos y la suma es calendario", () => {
  assert.equal(todayIsoGalapagos(new Date("2026-07-17T00:30:00.000Z")), "2026-07-16");
  assert.equal(addIsoDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addIsoDays("2026-12-31", 1), "2027-01-01");
});
