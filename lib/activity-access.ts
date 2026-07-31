import type { Actividad } from "./data";

export type ActivityEditAccess = "responsable" | "participante" | null;

export function activityEditAccess(
  activity: Pick<Actividad, "funcionarioId" | "participantesIds">,
  funcionarioId: string | null | undefined,
): ActivityEditAccess {
  if (!funcionarioId) return null;
  if (activity.funcionarioId === funcionarioId) return "responsable";
  if ((activity.participantesIds ?? []).includes(funcionarioId)) {
    return "participante";
  }
  return null;
}

export function canFuncionarioEditActivity(
  activity: Pick<Actividad, "funcionarioId" | "participantesIds">,
  funcionarioId: string | null | undefined,
): boolean {
  return activityEditAccess(activity, funcionarioId) !== null;
}

export function canFuncionarioDeleteActivity(
  activity: Pick<Actividad, "funcionarioId">,
  funcionarioId: string | null | undefined,
): boolean {
  return Boolean(funcionarioId && activity.funcionarioId === funcionarioId);
}

/**
 * A normal user can never reassign an activity. A participant receives edit
 * access from the current persisted row, so a forged payload cannot use that
 * permission to change the activity type or the participant list that grants
 * access to other users.
 */
export function constrainUserActivityDraft(
  draft: Actividad,
  current: Actividad,
  access: Exclude<ActivityEditAccess, null>,
): Actividad {
  return {
    ...draft,
    funcionarioId: current.funcionarioId,
    tipo: access === "participante" ? current.tipo : draft.tipo,
    participantesIds: access === "participante" ? current.participantesIds : draft.participantesIds,
  };
}

export function mergeUserActivityChanges(
  currentActivities: Actividad[],
  postedActivities: Actividad[],
  funcionarioId: string,
  sanitize: (draft: Actividad, current: Actividad) => Actividad,
): Actividad[] {
  const postedById = new Map(postedActivities.map((activity) => [activity.id, activity]));

  return currentActivities.flatMap((current) => {
    const access = activityEditAccess(current, funcionarioId);
    if (!access) return [current];

    const draft = postedById.get(current.id);
    // Omitting a row is the legacy delete operation. Edit access does not let
    // a participant delete another person's activity.
    if (!draft) return access === "responsable" ? [] : [current];

    return [sanitize(constrainUserActivityDraft(draft, current, access), current)];
  });
}
