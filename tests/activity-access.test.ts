import assert from "node:assert/strict";
import test from "node:test";
import {
  activityEditAccess,
  canFuncionarioDeleteActivity,
  canFuncionarioEditActivity,
  constrainUserActivityDraft,
  mergeUserActivityChanges,
} from "../lib/activity-access";
import type { Actividad } from "../lib/data";

const meeting: Actividad = {
  id: "a_meeting",
  tipo: "reunion",
  titulo: "Reunión",
  descripcion: "",
  funcionarioId: "f_responsable",
  participantesIds: ["f_participante"],
  competenciaId: "c1",
  entregableId: null,
  estado: "pendiente",
  fechaCreacion: "2026-07-24",
  fechaInicio: "2026-07-25T09:00",
  fechaFin: "2026-07-25T09:00",
  fechaCumplimiento: null,
  observaciones: "",
  accionesPendientes: "",
  resultadosAlcanzados: "",
  orden: 0,
};

const assignment: Actividad = {
  ...meeting,
  id: "a_assignment",
  tipo: "asignacion",
  titulo: "Asignación",
  fechaInicio: "2026-07-25",
  fechaFin: "2026-07-26",
};

test("responsible and participants can edit assignments and meetings, but outsiders cannot", () => {
  for (const activity of [assignment, meeting]) {
    assert.equal(activityEditAccess(activity, "f_responsable"), "responsable");
    assert.equal(activityEditAccess(activity, "f_participante"), "participante");
    assert.equal(canFuncionarioEditActivity(activity, "f_participante"), true);
    assert.equal(canFuncionarioEditActivity(activity, "f_otro"), false);
  }
});

test("deletion remains restricted to the responsible person", () => {
  for (const activity of [assignment, meeting]) {
    assert.equal(canFuncionarioDeleteActivity(activity, "f_responsable"), true);
    assert.equal(canFuncionarioDeleteActivity(activity, "f_participante"), false);
  }
});

test("a participant edit preserves the responsible person, type and participant list", () => {
  for (const current of [assignment, meeting]) {
    const forgedDraft: Actividad = {
      ...current,
      tipo: current.tipo === "reunion" ? "asignacion" : "reunion",
      funcionarioId: "f_participante",
      participantesIds: ["f_otro"],
      titulo: "Título editado",
    };

    assert.deepEqual(constrainUserActivityDraft(forgedDraft, current, "participante"), {
      ...forgedDraft,
      tipo: current.tipo,
      funcionarioId: "f_responsable",
      participantesIds: ["f_participante"],
    });
  }
});

test("participant changes merge into their current assignments and meetings only", () => {
  const otherAssignment: Actividad = {
    ...assignment,
    id: "a_other",
    funcionarioId: "f_otro",
    participantesIds: [],
    titulo: "Asignación ajena",
  };
  const postedMeeting = { ...meeting, titulo: "Reunión editada" };
  const postedAssignment = { ...assignment, titulo: "Asignación editada" };
  const forgedAssignment = { ...otherAssignment, titulo: "Cambio no autorizado" };

  assert.deepEqual(
    mergeUserActivityChanges(
      [meeting, assignment, otherAssignment],
      [postedMeeting, postedAssignment, forgedAssignment],
      "f_participante",
      (draft) => draft,
    ),
    [postedMeeting, postedAssignment, otherAssignment],
  );
});

test("omitting an assignment or meeting does not let a participant delete it", () => {
  assert.deepEqual(
    mergeUserActivityChanges([assignment, meeting], [], "f_participante", (draft) => draft),
    [assignment, meeting],
  );
});

test("the responsible person can still edit and delete their own activities", () => {
  const edited = { ...meeting, titulo: "Cambio del responsable" };
  assert.deepEqual(
    mergeUserActivityChanges([meeting], [edited], "f_responsable", (draft) => draft),
    [edited],
  );
  assert.deepEqual(
    mergeUserActivityChanges([meeting], [], "f_responsable", (draft) => draft),
    [],
  );
});

test("an outsider cannot grant themselves access through a forged draft", () => {
  for (const activity of [assignment, meeting]) {
    const forged = { ...activity, participantesIds: [...activity.participantesIds, "f_otro"] };
    assert.deepEqual(
      mergeUserActivityChanges([activity], [forged], "f_otro", (draft) => draft),
      [activity],
    );
  }
});
