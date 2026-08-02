import assert from "node:assert/strict";
import test from "node:test";
import { INACTIVE_RUN_STATUSES, canArchiveRun, canCancelRun } from "../platform/runtime/run-lifecycle.mjs";

test("allows active work to stop but not archive", () => {
  const run = { currentStage: "researching", status: "running" };
  assert.equal(canCancelRun(run), true);
  assert.equal(canArchiveRun(run), false);
});

test("keeps published work immutable and archivable", () => {
  const run = { currentStage: "published", status: "complete" };
  assert.equal(canCancelRun(run), false);
  assert.equal(canArchiveRun(run), true);
});

test("treats canceled work as inactive and archivable", () => {
  const run = { currentStage: "verifying", status: "canceled" };
  assert.equal(canCancelRun(run), false);
  assert.equal(canArchiveRun(run), true);
  assert.ok(INACTIVE_RUN_STATUSES.includes("canceled"));
});
