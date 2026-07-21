export type ActivityCreationPhase = "saving" | "verifying";
export type ActivityCreationState = "idle" | ActivityCreationPhase | "success" | "failed";

export interface ActivityOperationState {
  state: ActivityCreationState;
  verifiedActivityId: string | null;
}

export type ActivityOperationEvent =
  | { type: "reset" }
  | { type: "start" }
  | { type: "verify" }
  | { type: "verified"; activityId: string }
  | { type: "adoptVerified"; activityId: string }
  | { type: "fail" };

export const INITIAL_ACTIVITY_OPERATION: ActivityOperationState = {
  state: "idle",
  verifiedActivityId: null,
};

export function activityOperationReducer(
  current: ActivityOperationState,
  event: ActivityOperationEvent,
): ActivityOperationState {
  switch (event.type) {
    case "reset":
      return INITIAL_ACTIVITY_OPERATION;
    case "start":
      return { state: "saving", verifiedActivityId: null };
    case "verify":
      return current.state === "saving" || current.state === "verifying"
        ? { ...current, state: "verifying" }
        : current;
    case "verified":
      return event.activityId && current.state === "verifying"
        ? { state: "success", verifiedActivityId: event.activityId }
        : current;
    case "adoptVerified":
      return event.activityId ? { state: "success", verifiedActivityId: event.activityId } : current;
    case "fail":
      return current.state === "saving" || current.state === "verifying"
        ? { state: "failed", verifiedActivityId: null }
        : current;
  }
}

export function canClearVerifiedActivityDraft(operation: ActivityOperationState): boolean {
  return operation.state === "success" && Boolean(operation.verifiedActivityId);
}

export interface SubmissionGuard {
  tryAcquire(): number | null;
  isCurrent(token: number): boolean;
  release(token: number): void;
  invalidate(): void;
  isLocked(): boolean;
}

/** Immediate, render-independent lock: two clicks in the same tick get one lease. */
export function createSubmissionGuard(): SubmissionGuard {
  let generation = 0;
  let locked = false;
  return {
    tryAcquire() {
      if (locked) return null;
      locked = true;
      generation += 1;
      return generation;
    },
    isCurrent(token) {
      return locked && token === generation;
    },
    release(token) {
      if (token === generation) locked = false;
    },
    invalidate() {
      generation += 1;
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
}
