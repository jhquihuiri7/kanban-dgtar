import assert from "node:assert/strict";
import test from "node:test";
import { validateActivityDocument, validateExistingActivityDocumentIds } from "../lib/activity-document";
import type { Actividad, Competencia, Entregable, Funcionario, Gestion } from "../lib/data";

const existing = [{ id: "a1" }, { id: "a2" }] as Actividad[];

test("legacy document writes reject activity creation bypass", () => {
  assert.equal(validateExistingActivityDocumentIds(existing, [{ id: "a1" }, { id: "new" }])?.code, "ACTIVITY_CREATE_REQUIRES_ENDPOINT");
  assert.equal(validateExistingActivityDocumentIds(existing, [{ titulo: "sin id" }])?.code, "ACTIVITY_CREATE_REQUIRES_ENDPOINT");
});

test("legacy document writes reject duplicate ids and accept existing subsets", () => {
  assert.equal(validateExistingActivityDocumentIds(existing, [{ id: "a1" }, { id: "a1" }])?.code, "DUPLICATE_ACTIVITY_ID");
  assert.equal(validateExistingActivityDocumentIds(existing, [{ id: "a2" }]), null);
});

const gestiones: Gestion[] = [{ id: "g1", nombre: "Gestión 1", color: "#fff" }];
const funcionarios: Funcionario[] = [
  { id: "f1", nombre: "Responsable", email: "f1@example.com", cargo: "Técnico", gestionId: "g1", color: "#fff" },
  { id: "f2", nombre: "Participante", email: "f2@example.com", cargo: "Técnico", gestionId: "g1", color: "#000" },
];
const competencias: Competencia[] = [{ id: "c1", nombre: "Competencia", gestionId: "g1" }];
const entregables: Entregable[] = [{ id: "e1", nombre: "Entregable", gestionId: "g1" }];

function activity(overrides: Partial<Actividad> = {}): Actividad {
  return {
    id: "a1",
    tipo: "asignacion",
    titulo: "Actividad válida",
    descripcion: "",
    funcionarioId: "f1",
    participantesIds: [],
    competenciaId: "c1",
    entregableId: "e1",
    estado: "pendiente",
    fechaCreacion: "2026-07-16",
    fechaInicio: "2026-07-16",
    fechaFin: "2026-07-23",
    fechaCumplimiento: null,
    observaciones: "",
    accionesPendientes: "",
    resultadosAlcanzados: "",
    orden: 0,
    ...overrides,
  };
}

function documentWith(actividad: Actividad) {
  return { gestiones, funcionarios, competencias, entregables, actividades: [actividad] };
}

test("the final legacy document accepts coherent assignment and meeting dates", () => {
  assert.equal(validateActivityDocument(documentWith(activity({ participantesIds: ["f2"] }))), null);
  assert.equal(
    validateActivityDocument(
      documentWith(
        activity({
          tipo: "reunion",
          participantesIds: ["f2"],
          fechaInicio: "2026-07-17T23:59",
          fechaFin: "2026-07-17T23:59",
        }),
      ),
    ),
    null,
  );
});

test("the final legacy document rejects impossible and incoherent dates", () => {
  assert.match(
    validateActivityDocument(documentWith(activity({ fechaCreacion: "2026-02-30" })))?.message ?? "",
    /fechaCreacion/,
  );
  assert.match(
    validateActivityDocument(documentWith(activity({ fechaFin: "2026-02-30" })))?.message ?? "",
    /fechaFin/,
  );
  assert.match(
    validateActivityDocument(
      documentWith(
        activity({
          tipo: "reunion",
          fechaInicio: "2026-07-16T25:00",
          fechaFin: "2026-07-16T25:00",
        }),
      ),
    )?.message ?? "",
    /fechaInicio/,
  );
  assert.match(
    validateActivityDocument(
      documentWith(activity({ fechaInicio: "2026-07-24", fechaFin: "2026-07-23" })),
    )?.message ?? "",
    /posterior/,
  );
});

test("the final legacy document rejects invalid catalog references and state invariants", () => {
  assert.match(
    validateActivityDocument(documentWith(activity({ funcionarioId: "missing" })))?.message ?? "",
    /funcionarioId/,
  );
  assert.match(
    validateActivityDocument(documentWith(activity({ estado: "cumplida", fechaCumplimiento: null })))?.message ?? "",
    /fechaCumplimiento/,
  );
  assert.match(
    validateActivityDocument(documentWith(activity({ participantesIds: ["missing"] })))?.message ?? "",
    /inexistente/,
  );
});

test("legacy assignments accept same-day, leap-day and multi-year intervals", () => {
  assert.equal(
    validateActivityDocument(
      documentWith(
        activity({
          fechaCreacion: "2028-02-29",
          fechaInicio: "2028-02-29",
          fechaFin: "2028-02-29",
        }),
      ),
    ),
    null,
  );
  assert.equal(
    validateActivityDocument(
      documentWith(activity({ fechaInicio: "2020-01-01", fechaFin: "2030-01-01" })),
    ),
    null,
  );
});

test("assignment and meeting participants share the same document invariants", () => {
  const assignment = activity({ participantesIds: ["f2"] });
  assert.equal(validateActivityDocument(documentWith(assignment)), null);
  assert.match(
    validateActivityDocument(documentWith({ ...assignment, participantesIds: ["f1"] }))?.message ?? "",
    /responsable/,
  );
  assert.match(
    validateActivityDocument(documentWith({ ...assignment, participantesIds: ["f2", "f2"] }))?.message ?? "",
    /duplicados/,
  );

  const meeting = activity({
    tipo: "reunion",
    participantesIds: ["f2"],
    fechaInicio: "2026-07-15T00:00",
    fechaFin: "2026-07-15T00:00",
  });
  assert.equal(validateActivityDocument(documentWith(meeting)), null);
  assert.match(
    validateActivityDocument(documentWith({ ...meeting, participantesIds: ["f1"] }))?.message ?? "",
    /responsable/,
  );
});

test("meeting start and end date-times remain identical", () => {
  const meeting = activity({
    tipo: "reunion",
    participantesIds: ["f2"],
    fechaInicio: "2026-07-15T00:00",
    fechaFin: "2026-07-15T00:00",
  });
  assert.match(
    validateActivityDocument(documentWith({ ...meeting, fechaFin: "2026-07-15T00:00:00" }))?.message ?? "",
    /fechaFin/,
  );
  assert.match(
    validateActivityDocument(documentWith({ ...meeting, fechaFin: "2026-07-15T00:01" }))?.message ?? "",
    /exactamente iguales/,
  );
});

test("archived compatibility and catalog consistency are explicit", () => {
  assert.equal(
    validateActivityDocument(
      documentWith(activity({ estado: "archivada", fechaCumplimiento: "2026-07-16" })),
    ),
    null,
  );
  const otherGestion: Gestion = { id: "g2", nombre: "Gestión 2", color: "" };
  const mismatchedDocument = {
    gestiones: [...gestiones, otherGestion],
    funcionarios,
    competencias,
    entregables: [{ ...entregables[0], gestionId: "g2" }],
    actividades: [activity()],
  };
  assert.match(validateActivityDocument(mismatchedDocument)?.message ?? "", /misma gestión/);
  assert.match(
    validateActivityDocument({ ...documentWith(activity()), gestiones: [...gestiones, { ...gestiones[0] }] })?.message ?? "",
    /duplicado/,
  );
});
