import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildOperationalSnapshot } from "../platform/runtime/operations.mjs";

test("summarizes queue health without traveler or destination data", () => {
  const snapshot = buildOperationalSnapshot({
    generatedAt: "2026-08-02T12:30:00.000Z",
    monthStart: "2026-08-01T00:00:00.000Z",
    resetAt: "2026-09-01T00:00:00.000Z",
    runGroups: [
      { status: "queued", stage: "brief", count: 2 },
      { status: "failed", stage: "researching", count: 1 },
      { status: "awaiting_confirmation", stage: "verifying", count: 1 },
    ],
    laneGroups: [{ status: "succeeded", count: 6 }, { status: "failed", count: 1 }],
    usageGroups: [{ kind: "poi", calls: 17 }, { kind: "route", calls: 9 }],
    ownerCount: 3,
    claimableCount: 2,
    activeLeaseCount: 1,
    expiredLeaseCount: 1,
    archivedRunCount: 4,
    oldestClaimableAt: "2026-08-02T12:00:00.000Z",
  });
  assert.equal(snapshot.state, "attention");
  assert.deepEqual(snapshot.queue, {
    claimable: 2,
    active_leases: 1,
    expired_leases: 1,
    oldest_claimable_at: "2026-08-02T12:00:00.000Z",
    oldest_wait_seconds: 1800,
  });
  assert.equal(snapshot.provider_usage.total_calls, 26);
  assert.equal(snapshot.travelers.total, 3);
  assert.equal(snapshot.runs.active_total, 4);
  assert.equal(snapshot.runs.archived, 4);
  assert.deepEqual(snapshot.attention, [
    "expired_leases",
    "failed_runs",
    "failed_research_lanes",
    "awaiting_confirmation",
    "queue_wait_over_15m",
  ]);
  assert.equal(JSON.stringify(snapshot).includes("destination"), false);
  assert.equal(JSON.stringify(snapshot).includes("owner_user_id"), false);
});

test("reports idle, waiting and working states deterministically", () => {
  const base = {
    generatedAt: "2026-08-02T12:30:00.000Z",
    monthStart: "2026-08-01T00:00:00.000Z",
    resetAt: "2026-09-01T00:00:00.000Z",
  };
  assert.equal(buildOperationalSnapshot(base).state, "idle");
  assert.equal(buildOperationalSnapshot({ ...base, claimableCount: 1 }).state, "waiting_for_worker");
  assert.equal(buildOperationalSnapshot({ ...base, claimableCount: 1, activeLeaseCount: 1 }).state, "working");
});

test("protects the aggregate operations endpoint with the server token", async () => {
  const route = await readFile(new URL("../app/api/planning-runs/ops/route.ts", import.meta.url), "utf8");
  assert.match(route, /const denied = await deny\(request\)/);
  assert.match(route, /count\(distinct/);
  assert.match(route, /groupBy\(planningRuns\.status, planningRuns\.currentStage\)/);
  assert.doesNotMatch(route, /briefJson|destination|ownerUserId:\s*planningRuns/);
});
