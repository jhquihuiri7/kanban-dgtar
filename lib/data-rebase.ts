import type { Actividad, Competencia, Entregable, Funcionario, Gestion } from "./data";

export interface DataDocument {
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  actividades: Actividad[];
}

export class DataMergeConflictError extends Error {
  constructor(readonly conflicts: string[]) {
    super(`Cambios concurrentes incompatibles: ${conflicts.join(", ")}`);
    this.name = "DataMergeConflictError";
  }
}

type Entity = { id: string };

function sameEntity(left: Entity | undefined, right: Entity | undefined): boolean {
  return left === right || (left != null && right != null && JSON.stringify(left) === JSON.stringify(right));
}

/**
 * Three-way merge for the legacy document endpoint. Local changes are applied
 * over the latest server snapshot while unrelated remote changes are retained.
 * If both sides changed the same entity differently, no data is overwritten.
 */
function rebaseEntities<T extends Entity>(
  collection: string,
  base: T[],
  local: T[],
  remote: T[],
  conflicts: string[],
): T[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const locallyDeleted = new Set<string>();
  const locallyChanged = new Map<string, T>();
  const locallyAdded: T[] = [];

  for (const baseItem of base) {
    const localItem = localById.get(baseItem.id);
    const remoteItem = remoteById.get(baseItem.id);
    if (!localItem) {
      if (remoteItem && !sameEntity(remoteItem, baseItem)) conflicts.push(`${collection}:${baseItem.id}`);
      locallyDeleted.add(baseItem.id);
      continue;
    }
    if (sameEntity(localItem, baseItem)) continue;
    if (!remoteItem || (!sameEntity(remoteItem, baseItem) && !sameEntity(remoteItem, localItem))) {
      conflicts.push(`${collection}:${baseItem.id}`);
      continue;
    }
    locallyChanged.set(baseItem.id, localItem);
  }

  for (const localItem of local) {
    if (baseById.has(localItem.id)) continue;
    const remoteItem = remoteById.get(localItem.id);
    if (remoteItem && !sameEntity(remoteItem, localItem)) {
      conflicts.push(`${collection}:${localItem.id}`);
      continue;
    }
    if (!remoteItem) locallyAdded.push(localItem);
  }

  return [
    ...remote
      .filter((item) => !locallyDeleted.has(item.id))
      .map((item) => locallyChanged.get(item.id) ?? item),
    ...locallyAdded,
  ];
}

export function rebaseDataDocument(base: DataDocument, local: DataDocument, remote: DataDocument): DataDocument {
  const conflicts: string[] = [];
  const rebased: DataDocument = {
    gestiones: rebaseEntities("gestiones", base.gestiones, local.gestiones, remote.gestiones, conflicts),
    funcionarios: rebaseEntities("funcionarios", base.funcionarios, local.funcionarios, remote.funcionarios, conflicts),
    competencias: rebaseEntities("competencias", base.competencias, local.competencias, remote.competencias, conflicts),
    entregables: rebaseEntities("entregables", base.entregables, local.entregables, remote.entregables, conflicts),
    actividades: rebaseEntities("actividades", base.actividades, local.actividades, remote.actividades, conflicts),
  };
  if (conflicts.length > 0) throw new DataMergeConflictError(conflicts);
  return rebased;
}
