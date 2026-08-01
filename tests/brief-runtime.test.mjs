import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrief } from "../platform/runtime/brief.mjs";

test("normalizes a traveler brief into the platform contract", () => {
  const brief = normalizeBrief({
    destination: " 青田县 ",
    days: 3,
    interests: ["美食", "风景", "美食"],
    must_eat: ["田鱼", "田鱼"],
    must_visit: ["石门洞"],
    candidate_target: { min: 5, max: 99 },
    daily_stops: { min: 2, max: 9 },
  });
  assert.equal(brief.destination, "青田县");
  assert.deepEqual(brief.interests, ["美食", "风景"]);
  assert.deepEqual(brief.must_eat, ["田鱼"]);
  assert.deepEqual(brief.must_visit, ["石门洞"]);
  assert.deepEqual(brief.candidate_target, { min: 20, max: 40 });
  assert.deepEqual(brief.daily_stops, { min: 4, max: 6 });
  assert.equal(brief.transport_mode, "mixed");
});

test("rejects an invalid destination or duration", () => {
  assert.throws(() => normalizeBrief({ destination: "", days: 3 }), /destination/);
  assert.throws(() => normalizeBrief({ destination: "青田", days: 0 }), /days/);
});
