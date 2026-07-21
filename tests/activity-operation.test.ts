import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_ACTIVITY_OPERATION,
  activityOperationReducer,
  canClearVerifiedActivityDraft,
  createSubmissionGuard,
} from "../lib/activity-operation";

test("double click and simultaneous attempts receive only one submission lease", () => {
  const guard = createSubmissionGuard();
  const first = guard.tryAcquire();
  const second = guard.tryAcquire();
  assert.equal(typeof first, "number");
  assert.equal(second, null);
  guard.release(first!);
  assert.equal(typeof guard.tryAcquire(), "number");
});

test("a late result from an invalidated dialog cannot mutate the reopened form", () => {
  const guard = createSubmissionGuard();
  const oldToken = guard.tryAcquire()!;
  guard.invalidate();
  const newToken = guard.tryAcquire()!;
  assert.equal(guard.isCurrent(oldToken), false);
  assert.equal(guard.isCurrent(newToken), true);
});

test("success and draft cleanup require a verified activity id", () => {
  const saving = activityOperationReducer(INITIAL_ACTIVITY_OPERATION, { type: "start" });
  assert.equal(activityOperationReducer(saving, { type: "verified", activityId: "a_too_early" }).state, "saving");
  const verifying = activityOperationReducer(saving, { type: "verify" });
  const invalidSuccess = activityOperationReducer(verifying, { type: "verified", activityId: "" });
  const success = activityOperationReducer(verifying, { type: "verified", activityId: "a_confirmed" });
  assert.equal(invalidSuccess.state, "verifying");
  assert.equal(canClearVerifiedActivityDraft(invalidSuccess), false);
  assert.equal(success.state, "success");
  assert.equal(canClearVerifiedActivityDraft(success), true);
});

test("failure keeps the operation non-clearable and retry returns to saving", () => {
  const saving = activityOperationReducer(INITIAL_ACTIVITY_OPERATION, { type: "start" });
  const failed = activityOperationReducer(saving, { type: "fail" });
  assert.deepEqual(failed, { state: "failed", verifiedActivityId: null });
  assert.equal(canClearVerifiedActivityDraft(failed), false);
  assert.equal(activityOperationReducer(failed, { type: "start" }).state, "saving");
});

test("an explicitly adopted, already-verified row may close an ambiguous draft", () => {
  const failed = activityOperationReducer(
    activityOperationReducer(INITIAL_ACTIVITY_OPERATION, { type: "start" }),
    { type: "fail" },
  );
  const adopted = activityOperationReducer(failed, { type: "adoptVerified", activityId: "a_existing" });
  assert.equal(canClearVerifiedActivityDraft(adopted), true);
});
