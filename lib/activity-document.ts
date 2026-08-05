import type { Actividad } from "./data";

export interface ActivityDocumentIdError {
  code: "ACTIVITY_CREATE_REQUIRES_ENDPOINT" | "DUPLICATE_ACTIVITY_ID";
  message: string;
}

export interface ActivityDocumentValidationError {
  code: "INVALID_DOCUMENT";
  message: string;
}

export interface ActivityDocumentInput {
  gestiones: readonly unknown[];
  funcionarios: readonly unknown[];
  competencias: readonly unknown[];
  entregables: readonly unknown[];
  actividades: readonly unknown[];
}

type UnknownRecord = Record<string, unknown>;

const ENTITY_ID_RE = /^\S.{0,198}\S$|^\S$/;
const ACTIVITY_TYPES = new Set(["asignacion", "reunion"]);
const ACTIVITY_STATES = new Set(["pendiente", "en_progreso", "en_revision", "cumplida", "archivada"]);
const TEXT_FIELDS = [
  "descripcion",
  "observaciones",
  "accionesPendientes",
  "resultadosAlcanzados",
] as const;

function invalid(message: string): ActivityDocumentValidationError {
  return { code: "INVALID_DOCUMENT", message };
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validEntityId(value: unknown): value is string {
  return typeof value === "string" && ENTITY_ID_RE.test(value.trim()) && value === value.trim();
}

function validRequiredText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validMeetingDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return Boolean(
    match &&
      validDate(match[1]) &&
      Number(match[2]) <= 23 &&
      Number(match[3]) <= 59,
  );
}

function catalogById(
  values: readonly unknown[],
  label: string,
  validate: (value: UnknownRecord, index: number) => ActivityDocumentValidationError | null,
): { records: Map<string, UnknownRecord>; error: ActivityDocumentValidationError | null } {
  const records = new Map<string, UnknownRecord>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!isRecord(value)) return { records, error: invalid(`${label}[${index}] debe ser un objeto.`) };
    if (!validEntityId(value.id)) {
      return { records, error: invalid(`${label}[${index}].id no es válido.`) };
    }
    if (records.has(value.id)) {
      return { records, error: invalid(`${label} contiene el id duplicado ${value.id}.`) };
    }
    const error = validate(value, index);
    if (error) return { records, error };
    records.set(value.id, value);
  }
  return { records, error: null };
}

/**
 * Runtime validation for the legacy full-document endpoint. It deliberately
 * validates the final merged document, not the raw user payload, so normal
 * users are checked after server-side sanitisation and admins cannot bypass
 * catalog/date invariants with a forged request.
 */
export function validateActivityDocument(data: ActivityDocumentInput): ActivityDocumentValidationError | null {
  const gestionesResult = catalogById(data.gestiones, "gestiones", (gestion, index) => {
    if (!validRequiredText(gestion.nombre, 500)) {
      return invalid(`gestiones[${index}].nombre es obligatorio y admite hasta 500 caracteres.`);
    }
    if (!validText(gestion.color, 100)) {
      return invalid(`gestiones[${index}].color debe ser texto de hasta 100 caracteres.`);
    }
    return null;
  });
  if (gestionesResult.error) return gestionesResult.error;
  const gestiones = gestionesResult.records;

  const funcionariosResult = catalogById(data.funcionarios, "funcionarios", (funcionario, index) => {
    if (!validRequiredText(funcionario.nombre, 500)) {
      return invalid(`funcionarios[${index}].nombre es obligatorio y admite hasta 500 caracteres.`);
    }
    if (!validText(funcionario.email, 320) || !validText(funcionario.cargo, 500) || !validText(funcionario.color, 100)) {
      return invalid(`funcionarios[${index}] contiene campos de texto no válidos.`);
    }
    if (!validEntityId(funcionario.gestionId) || !gestiones.has(funcionario.gestionId)) {
      return invalid(`funcionarios[${index}].gestionId no existe.`);
    }
    return null;
  });
  if (funcionariosResult.error) return funcionariosResult.error;
  const funcionarios = funcionariosResult.records;

  const competenciasResult = catalogById(data.competencias, "competencias", (competencia, index) => {
    if (!validRequiredText(competencia.nombre, 1_000)) {
      return invalid(`competencias[${index}].nombre es obligatorio y admite hasta 1000 caracteres.`);
    }
    if (!validEntityId(competencia.gestionId) || !gestiones.has(competencia.gestionId)) {
      return invalid(`competencias[${index}].gestionId no existe.`);
    }
    return null;
  });
  if (competenciasResult.error) return competenciasResult.error;
  const competencias = competenciasResult.records;

  const entregablesResult = catalogById(data.entregables, "entregables", (entregable, index) => {
    if (!validRequiredText(entregable.nombre, 1_000)) {
      return invalid(`entregables[${index}].nombre es obligatorio y admite hasta 1000 caracteres.`);
    }
    if (!validEntityId(entregable.competenciaId) || !competencias.has(entregable.competenciaId)) {
      return invalid(`entregables[${index}].competenciaId no existe.`);
    }
    return null;
  });
  if (entregablesResult.error) return entregablesResult.error;
  const entregables = entregablesResult.records;

  const activityIds = new Set<string>();
  for (let index = 0; index < data.actividades.length; index += 1) {
    const value = data.actividades[index];
    const prefix = `actividades[${index}]`;
    if (!isRecord(value)) return invalid(`${prefix} debe ser un objeto.`);
    if (!validEntityId(value.id)) return invalid(`${prefix}.id no es válido.`);
    if (activityIds.has(value.id)) return invalid(`actividades contiene el id duplicado ${value.id}.`);
    activityIds.add(value.id);

    if (!ACTIVITY_TYPES.has(value.tipo as string)) return invalid(`${prefix}.tipo no es válido.`);
    if (!ACTIVITY_STATES.has(value.estado as string)) return invalid(`${prefix}.estado no es válido.`);
    if (!validRequiredText(value.titulo, 500)) {
      return invalid(`${prefix}.titulo es obligatorio y admite hasta 500 caracteres.`);
    }
    for (const field of TEXT_FIELDS) {
      if (!validText(value[field], 20_000)) {
        return invalid(`${prefix}.${field} debe ser texto de hasta 20000 caracteres.`);
      }
    }
    if (!validEntityId(value.funcionarioId) || !funcionarios.has(value.funcionarioId)) {
      return invalid(`${prefix}.funcionarioId no existe.`);
    }
    if (!validEntityId(value.competenciaId) || !competencias.has(value.competenciaId)) {
      return invalid(`${prefix}.competenciaId no existe.`);
    }

    if (value.entregableId !== null) {
      if (!validEntityId(value.entregableId) || !entregables.has(value.entregableId)) {
        return invalid(`${prefix}.entregableId no existe.`);
      }
      const entregable = entregables.get(value.entregableId);
      if (entregable?.competenciaId !== value.competenciaId) {
        return invalid(`${prefix}: el entregable debe pertenecer a la competencia de la actividad.`);
      }
    }

    if (!Array.isArray(value.participantesIds) || value.participantesIds.length > 200) {
      return invalid(`${prefix}.participantesIds no es válido.`);
    }
    const participantes = new Set<string>();
    for (const participanteId of value.participantesIds) {
      if (!validEntityId(participanteId) || !funcionarios.has(participanteId)) {
        return invalid(`${prefix}.participantesIds contiene un funcionario inexistente.`);
      }
      if (participanteId === value.funcionarioId) {
        return invalid(`${prefix}: el responsable no puede repetirse como participante.`);
      }
      if (participantes.has(participanteId)) {
        return invalid(`${prefix}.participantesIds contiene duplicados.`);
      }
      participantes.add(participanteId);
    }
    if (!validDate(value.fechaCreacion)) return invalid(`${prefix}.fechaCreacion no es una fecha válida.`);
    if (!Number.isInteger(value.orden) || (value.orden as number) < -2_147_483_648 || (value.orden as number) > 2_147_483_647) {
      return invalid(`${prefix}.orden debe ser un entero válido.`);
    }

    if (value.tipo === "asignacion") {
      if (!validDate(value.fechaInicio)) {
        return invalid(`${prefix}.fechaInicio no es una fecha válida.`);
      }
      if (!validDate(value.fechaFin)) {
        return invalid(`${prefix}.fechaFin no es una fecha válida.`);
      }
      if (value.fechaInicio > value.fechaFin) {
        return invalid(`${prefix}.fechaInicio no puede ser posterior a fechaFin.`);
      }
    } else {
      if (!validMeetingDateTime(value.fechaInicio)) {
        return invalid(`${prefix}.fechaInicio no contiene una fecha y hora válidas.`);
      }
      if (!validMeetingDateTime(value.fechaFin)) {
        return invalid(`${prefix}.fechaFin no contiene una fecha y hora válidas.`);
      }
      if (value.fechaInicio !== value.fechaFin) {
        return invalid(`${prefix}.fechaInicio y fechaFin deben ser exactamente iguales para una reunión.`);
      }
    }

    if (value.estado === "cumplida") {
      if (!validDate(value.fechaCumplimiento)) {
        return invalid(`${prefix}.fechaCumplimiento es obligatoria para una actividad cumplida.`);
      }
    } else if (value.estado === "archivada") {
      if (value.fechaCumplimiento !== null && !validDate(value.fechaCumplimiento)) {
        return invalid(`${prefix}.fechaCumplimiento no es válida.`);
      }
    } else if (value.fechaCumplimiento !== null) {
      return invalid(`${prefix}.fechaCumplimiento debe ser null mientras la actividad no esté cumplida.`);
    }
  }

  return null;
}

/** The legacy full-document endpoint may edit/delete rows, never create them. */
export function validateExistingActivityDocumentIds(
  current: readonly Actividad[],
  posted: readonly unknown[],
): ActivityDocumentIdError | null {
  const currentIds = new Set(current.map((activity) => activity.id));
  const postedIds = new Set<string>();
  for (const value of posted) {
    const id = value && typeof value === "object" ? (value as { id?: unknown }).id : null;
    if (typeof id !== "string" || !currentIds.has(id)) {
      return {
        code: "ACTIVITY_CREATE_REQUIRES_ENDPOINT",
        message: "Las actividades nuevas deben crearse mediante el flujo de guardado confiable.",
      };
    }
    if (postedIds.has(id)) {
      return { code: "DUPLICATE_ACTIVITY_ID", message: "El documento contiene una actividad duplicada." };
    }
    postedIds.add(id);
  }
  return null;
}
