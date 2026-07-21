import type { EstadoActividad, TipoActividad } from "./data";

export const ACTIVITY_DRAFT_VERSION = 2;
const ACTIVITY_DRAFT_PREFIX = "kanban:new-activity-draft";
const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export interface ActivityDraft {
  version: typeof ACTIVITY_DRAFT_VERSION;
  savedAt: number;
  clientRequestId: string;
  tipo: TipoActividad;
  estado: Exclude<EstadoActividad, "archivada">;
  titulo: string;
  descripcion: string;
  accionesPendientes: string;
  resultadosAlcanzados: string;
  funcionarioId: string;
  participantesIds: string[];
  gestionId: string;
  competenciaId: string;
  entregableId: string;
  plazoDias: string;
  fechaReunion: string;
  horaReunion: string;
}

export function activityDraftStoragePrefix(userId: string): string {
  return `${ACTIVITY_DRAFT_PREFIX}:${ACTIVITY_DRAFT_VERSION}:${encodeURIComponent(userId)}`;
}

export function activityDraftStorageKey(userId: string, tabScope?: string): string {
  const base = activityDraftStoragePrefix(userId);
  return tabScope ? `${base}:${encodeURIComponent(tabScope)}` : base;
}

export function isActivityDraftStorageKey(key: string, userId: string): boolean {
  const prefix = activityDraftStoragePrefix(userId);
  return key === prefix || key.startsWith(`${prefix}:`);
}

export function serializeActivityDraft(draft: ActivityDraft): string {
  return JSON.stringify(draft);
}

export function parseActivityDraft(raw: string | null, now = Date.now()): ActivityDraft | null {
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== ACTIVITY_DRAFT_VERSION) return null;
    if (
      typeof value.savedAt !== "number" ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now + 5 * 60 * 1_000
    ) return null;
    if (typeof value.clientRequestId !== "string" || !CLIENT_REQUEST_ID_RE.test(value.clientRequestId)) return null;
    if (value.tipo !== "asignacion" && value.tipo !== "reunion") return null;
    if (!isCreationState(value.estado)) return null;

    const stringFields = [
      "titulo",
      "descripcion",
      "accionesPendientes",
      "resultadosAlcanzados",
      "funcionarioId",
      "gestionId",
      "competenciaId",
      "entregableId",
      "plazoDias",
      "fechaReunion",
      "horaReunion",
    ] as const;
    if (stringFields.some((field) => typeof value[field] !== "string")) return null;
    if (!Array.isArray(value.participantesIds) || !value.participantesIds.every((id) => typeof id === "string")) {
      return null;
    }

    return {
      version: ACTIVITY_DRAFT_VERSION,
      savedAt: value.savedAt,
      clientRequestId: value.clientRequestId,
      tipo: value.tipo,
      estado: value.estado,
      titulo: value.titulo as string,
      descripcion: value.descripcion as string,
      accionesPendientes: value.accionesPendientes as string,
      resultadosAlcanzados: value.resultadosAlcanzados as string,
      funcionarioId: value.funcionarioId as string,
      participantesIds: Array.from(new Set(value.participantesIds)),
      gestionId: value.gestionId as string,
      competenciaId: value.competenciaId as string,
      entregableId: value.entregableId as string,
      plazoDias: value.plazoDias as string,
      fechaReunion: value.fechaReunion as string,
      horaReunion: value.horaReunion as string,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCreationState(value: unknown): value is ActivityDraft["estado"] {
  return value === "pendiente" || value === "en_progreso" || value === "en_revision" || value === "cumplida";
}
