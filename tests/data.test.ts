import assert from "node:assert/strict";
import test from "node:test";
import { fechaFinInfo, type Actividad } from "../lib/data";

const base: Actividad = {
  id: "a_dates",
  tipo: "asignacion",
  titulo: "Actividad con rango",
  descripcion: "",
  funcionarioId: "f1",
  participantesIds: [],
  competenciaId: "c1",
  entregableId: null,
  estado: "pendiente",
  fechaCreacion: "2026-07-20",
  fechaInicio: "2026-07-21",
  fechaFin: "2026-07-24",
  fechaCumplimiento: null,
  observaciones: "",
  accionesPendientes: "",
  resultadosAlcanzados: "",
  orden: 0,
};

test("fechaFinInfo describes the end date without plazo semantics", () => {
  assert.deepEqual(fechaFinInfo(base, "2026-07-24"), {
    kind: "today",
    text: "Finaliza hoy",
    tone: "amber",
    days: 0,
  });
  assert.deepEqual(fechaFinInfo(base, "2026-07-26"), {
    kind: "ended",
    text: "Fin superado 2d",
    tone: "red",
    days: -2,
  });
});

test("fechaFinInfo stops monitoring delay once an activity is completed", () => {
  const expected = { kind: "ok", text: "Cumplida", tone: "green" };
  assert.deepEqual(
    fechaFinInfo({ ...base, estado: "cumplida", fechaCumplimiento: "2026-07-24" }, "2026-07-26"),
    expected,
  );
  assert.deepEqual(
    fechaFinInfo({ ...base, estado: "cumplida", fechaCumplimiento: "2026-07-25" }, "2026-07-26"),
    expected,
  );
  assert.deepEqual(
    fechaFinInfo({ ...base, estado: "cumplida", fechaCumplimiento: null }, "2026-07-26"),
    expected,
  );
});

test("fechaFinInfo resumes monitoring the end date if a completed activity is reopened", () => {
  assert.deepEqual(
    fechaFinInfo({ ...base, estado: "en_revision", fechaCumplimiento: null }, "2026-07-26"),
    {
      kind: "ended",
      text: "Fin superado 2d",
      tone: "red",
      days: -2,
    },
  );
});
