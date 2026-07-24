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

test("responsible and meeting participants can edit, but outsiders cannot", () => {
  assert.equal(activityEditAccess(meeting, "f_responsable"), "responsable");
  assert.equal(activityEditAccess(meeting, "f_participante"), "participante");
  assert.equal(canFuncionarioEditActivity(meeting, "f_participante"), true);
  assert.equal(canFuncionarioEditActivity(meeting, "f_otro"), false);
});

test("participants do not gain edit access to assignments", () => {
  const assignment = { ...meeting, tipo: "asignacion" as const };
  assert.equal(activityEditAccess(assignment, "f_participante"), null);
  assert.equal(canFuncionarioEditActivity(assignment, "f_participante"), false);
});

test("deletion remains restricted to the responsible person", () => {
  assert.equal(canFuncionarioDeleteActivity(meeting, "f_responsable"), true);
  assert.equal(canFuncionarioDeleteActivity(meeting, "f_participante"), false);
});

test("a participant edit preserves the responsible person and meeting type", () => {
  const forgedDraft: Actividad = {
    ...meeting,
    tipo: "asignacion",
    funcionarioId: "f_participante",
    participantesIds: ["f_otro"],
    titulo: "Título editado",
  };

  assert.deepEqual(constrainUserActivityDraft(forgedDraft, meeting, "participante"), {
    ...forgedDraft,
    tipo: "reunion",
    funcionarioId: "f_responsable",
    participantesIds: ["f_participante"],
  });
});

test("participant changes merge only into their current meeting", () => {
  const otherAssignment: Actividad = {
    ...meeting,
    id: "a_other",
    tipo: "asignacion",
    funcionarioId: "f_otro",
    participantesIds: [],
    titulo: "Asignación ajena",
    fechaInicio: "2026-07-25",
    fechaFin: "2026-07-26",
  };
  const postedMeeting = { ...meeting, titulo: "Reunión editada" };
  const forgedAssignment = { ...otherAssignment, titulo: "Cambio no autorizado" };

  assert.deepEqual(
    mergeUserActivityChanges(
      [meeting, otherAssignment],
      [postedMeeting, forgedAssignment],
      "f_participante",
      (draft) => draft,
    ),
    [postedMeeting, otherAssignment],
  );
});

test("omitting a meeting does not let a participant delete it", () => {
  assert.deepEqual(
    mergeUserActivityChanges([meeting], [], "f_participante", (draft) => draft),
    [meeting],
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
  const forged = { ...meeting, participantesIds: [...meeting.participantesIds, "f_otro"] };
  assert.deepEqual(
    mergeUserActivityChanges([meeting], [forged], "f_otro", (draft) => draft),
    [meeting],
  );
});
