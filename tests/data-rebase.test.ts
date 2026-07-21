import assert from "node:assert/strict";
import test from "node:test";
import { DataMergeConflictError, rebaseDataDocument, type DataDocument } from "../lib/data-rebase";
import type { Actividad } from "../lib/data";

const baseActivity: Actividad = {
  id: "a1",
  tipo: "asignacion",
  titulo: "Original",
  descripcion: "",
  funcionarioId: "f1",
  participantesIds: [],
  competenciaId: "c1",
  entregableId: null,
  estado: "pendiente",
  fechaCreacion: "2026-07-16",
  plazoDias: 7,
  fechaVencimiento: "2026-07-23",
  fechaCumplimiento: null,
  observaciones: "",
  accionesPendientes: "",
  resultadosAlcanzados: "",
  orden: 1,
};

function document(actividades: Actividad[]): DataDocument {
  return {
    gestiones: [{ id: "g1", nombre: "Gestión", color: "#000" }],
    funcionarios: [{ id: "f1", nombre: "Persona", email: "", cargo: "", gestionId: "g1", color: "#000" }],
    competencias: [{ id: "c1", nombre: "Competencia", gestionId: "g1" }],
    entregables: [],
    actividades,
  };
}

test("rebase preserves a concurrent server creation while applying a local edit", () => {
  const remoteActivity = { ...baseActivity, id: "a2", titulo: "Creada en otra pestaña", orden: 2 };
  const result = rebaseDataDocument(
    document([baseActivity]),
    document([{ ...baseActivity, titulo: "Edición local" }]),
    document([baseActivity, remoteActivity]),
  );
  assert.deepEqual(result.actividades, [{ ...baseActivity, titulo: "Edición local" }, remoteActivity]);
});

test("rebase rejects two different edits to the same entity", () => {
  assert.throws(
    () =>
      rebaseDataDocument(
        document([baseActivity]),
        document([{ ...baseActivity, titulo: "Local" }]),
        document([{ ...baseActivity, titulo: "Remoto" }]),
      ),
    (error) => error instanceof DataMergeConflictError && error.conflicts.includes("actividades:a1"),
  );
});

test("rebase accepts the same concurrent edit without duplicating it", () => {
  const edited = { ...baseActivity, titulo: "Mismo cambio" };
  assert.deepEqual(
    rebaseDataDocument(document([baseActivity]), document([{ ...edited }]), document([{ ...edited }])).actividades,
    [edited],
  );
});

test("a newer local edit can be folded over an in-flight rebase without losing remote rows", () => {
  const remoteActivity = { ...baseActivity, id: "a2", titulo: "Creada remotamente", orden: 2 };
  const inFlight = document([{ ...baseActivity, titulo: "Edición P" }]);
  const queued = document([{ ...baseActivity, titulo: "Edición P", descripcion: "Edición Q" }]);
  const rebasedInFlight = rebaseDataDocument(
    document([baseActivity]),
    inFlight,
    document([baseActivity, remoteActivity]),
  );
  const finalDocument = rebaseDataDocument(inFlight, queued, rebasedInFlight);

  assert.deepEqual(finalDocument.actividades, [
    { ...baseActivity, titulo: "Edición P", descripcion: "Edición Q" },
    remoteActivity,
  ]);
});
