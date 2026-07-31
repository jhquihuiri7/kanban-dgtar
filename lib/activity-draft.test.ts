import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_DRAFT_VERSION,
  activityDraftStorageKey,
  isActivityDraftStorageKey,
  parseActivityDraft,
  serializeActivityDraft,
  type ActivityDraft,
} from "./activity-draft";

const draft: ActivityDraft = {
  version: ACTIVITY_DRAFT_VERSION,
  savedAt: 1_752_686_400_000,
  clientRequestId: "activity_request_same-on-retry",
  tipo: "asignacion",
  estado: "pendiente",
  titulo: "  Texto sin normalizar  ",
  descripcion: "",
  accionesPendientes: "",
  resultadosAlcanzados: "",
  funcionarioId: "f1",
  participantesIds: [],
  gestionId: "g1",
  competenciaId: "c1",
  entregableId: "",
  fechaInicio: "2026-07-16",
  fechaFin: "2026-07-23",
  fechaReunion: "2026-07-16",
  horaReunion: "09:00",
};

test("uses a versioned, user-scoped storage key", () => {
  assert.equal(activityDraftStorageKey("user/1"), "kanban:new-activity-draft:3:user%2F1");
  assert.notEqual(activityDraftStorageKey("user/1"), activityDraftStorageKey("user/2"));
  assert.notEqual(activityDraftStorageKey("user/1", "tab-a"), activityDraftStorageKey("user/1", "tab-b"));
  assert.equal(isActivityDraftStorageKey(activityDraftStorageKey("user/1", "tab-a"), "user/1"), true);
  assert.equal(isActivityDraftStorageKey(activityDraftStorageKey("user/10", "tab-a"), "user/1"), false);
});

test("round-trips raw form values and the idempotency key", () => {
  assert.deepEqual(parseActivityDraft(serializeActivityDraft(draft), draft.savedAt), draft);
});

test("rejects malformed or incompatible drafts", () => {
  assert.equal(parseActivityDraft("not-json", draft.savedAt), null);
  assert.equal(parseActivityDraft(JSON.stringify({ ...draft, version: 1 }), draft.savedAt), null);
  assert.equal(parseActivityDraft(JSON.stringify({ ...draft, version: 2 }), draft.savedAt), null);
  assert.equal(parseActivityDraft(JSON.stringify({ ...draft, clientRequestId: "" }), draft.savedAt), null);
  assert.equal(parseActivityDraft(JSON.stringify({ ...draft, competenciaId: null }), draft.savedAt), null);
  assert.equal(parseActivityDraft(JSON.stringify({ ...draft, estado: "archivada" }), draft.savedAt), null);
});

test("deduplicates participant ids for assignments and meetings without changing their order", () => {
  for (const tipo of ["asignacion", "reunion"] as const) {
    const parsed = parseActivityDraft(
      serializeActivityDraft({ ...draft, tipo, participantesIds: ["f2", "f2", "f3"] }),
      draft.savedAt,
    );
    assert.deepEqual(parsed?.participantesIds, ["f2", "f3"]);
  }
});

test("keeps an unverified draft after a long interruption", () => {
  assert.deepEqual(parseActivityDraft(serializeActivityDraft(draft), draft.savedAt + 365 * 24 * 60 * 60 * 1_000), draft);
});
