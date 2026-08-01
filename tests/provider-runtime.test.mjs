import assert from "node:assert/strict";
import test from "node:test";
import { chooseAmapMatch, normalizeAmapRoute, straightLineFallback } from "../platform/runtime/provider.mjs";
import { planVerifiedItinerary, routeModeForPair } from "../platform/runtime/schedule.mjs";

function rawPoi(id, name, cityname, adname, typecode = "110200", location = "123.430000,41.800000") {
  return { id, name, cityname, adname, typecode, location, address: `${adname}测试地址`, business: {} };
}

test("auto-verifies an exact in-region AMap POI with a clear confidence margin", () => {
  const result = chooseAmapMatch(
    { canonicalName: "沈阳故宫", aliases: [], themes: ["历史", "文化"] },
    [
      rawPoi("A1", "沈阳故宫", "沈阳市", "沈河区"),
      rawPoi("A2", "故宫便利店", "沈阳市", "沈河区", "060000"),
    ],
    "沈阳",
  );
  assert.equal(result.status, "verified");
  assert.equal(result.selected.providerPoiId, "A1");
  assert.ok(result.selected.confidence >= 0.8);
  assert.ok(result.margin >= 0.15);
  assert.equal(result.selected.location.coord_system, "GCJ-02");
});

test("keeps same-name AMap results ambiguous when the leading margin is too small", () => {
  const result = chooseAmapMatch(
    { canonicalName: "文化馆", aliases: [], themes: ["文化"] },
    [
      rawPoi("A1", "文化馆", "沈阳市", "沈河区", "140000"),
      rawPoi("A2", "文化馆", "沈阳市", "和平区", "140000", "123.400000,41.790000"),
    ],
    "沈阳",
  );
  assert.equal(result.status, "needs_confirmation");
  assert.equal(result.selected, null);
  assert.ok(result.margin < 0.15);
});

test("does not auto-verify a same-name POI returned from another city", () => {
  const result = chooseAmapMatch(
    { canonicalName: "博物馆", aliases: [], themes: ["历史"] },
    [rawPoi("A1", "博物馆", "北京市", "东城区", "140100", "116.400000,39.900000")],
    "沈阳",
  );
  assert.equal(result.status, "needs_confirmation");
  assert.ok(result.matches[0].confidence < 0.8);
});

function verifiedCandidate(index) {
  const cluster = index % 3;
  return {
    id: `candidate-${index}`,
    canonicalName: `地点${index}`,
    aliases: [],
    themes: index % 2 ? ["文化"] : ["美食"],
    whyVisit: `地点${index}的推荐理由`,
    score: 100 - index,
    stayMinutes: 60,
    verificationStatus: "verified",
    providerPoiId: `AMAP-${index}`,
    location: { lng: 123.2 + cluster * 0.2 + index * 0.001, lat: 41.7 + cluster * 0.1 + index * 0.001 },
  };
}

test("plans 4–6 verified POIs per day and produces only adjacent route counts", () => {
  const result = planVerifiedItinerary({
    brief: { days: 3, must_visit: ["地点14"] },
    candidates: Array.from({ length: 18 }, (_, index) => verifiedCandidate(index)),
    dailyMinimum: 4,
    dailyMaximum: 6,
    preferred: 5,
  });
  assert.equal(result.ok, true);
  assert.equal(result.selectedCount, 15);
  assert.equal(result.days.length, 3);
  assert.deepEqual(result.days.map((day) => day.assignments.length), [5, 5, 5]);
  assert.equal(result.routeSegmentCount, 12);
  assert.equal(new Set(result.days.flatMap((day) => day.assignments.map((item) => item.candidateId))).size, 15);
  assert.ok(result.days.some((day) => day.assignments.some((item) => item.candidateId === "candidate-14")));
});

test("refuses scheduling when a must-visit place is not verified", () => {
  const result = planVerifiedItinerary({
    brief: { days: 1, must_visit: ["未核验地点"] },
    candidates: Array.from({ length: 6 }, (_, index) => verifiedCandidate(index)),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MUST_VISIT_NOT_VERIFIED");
});

test("normalizes AMap v5 route cost and polyline without inventing fallback duration", () => {
  const route = normalizeAmapRoute({ route: { paths: [{ distance: "1250", cost: { duration: "900" }, steps: [
    { instruction: "向东步行", polyline: "123.1,41.1;123.2,41.2" },
    { instruction: "到达终点", polyline: "123.2,41.2;123.3,41.3" },
  ] }] } }, "walking");
  assert.equal(route.distanceM, 1250);
  assert.equal(route.durationS, 900);
  assert.deepEqual(route.geometry, [[123.1, 41.1], [123.2, 41.2], [123.3, 41.3]]);
  const fallback = straightLineFallback({ lng: 1, lat: 2 }, { lng: 3, lat: 4 }, "driving");
  assert.equal(fallback.status, "fallback_straight_line");
  assert.equal(fallback.durationS, null);
  assert.equal(fallback.distanceM, null);
});

test("uses walking only for short mixed-mode pairs", () => {
  assert.equal(routeModeForPair("mixed", { lng: 123, lat: 41 }, { lng: 123.01, lat: 41 }), "walking");
  assert.equal(routeModeForPair("mixed", { lng: 123, lat: 41 }, { lng: 123.1, lat: 41 }), "driving");
  assert.equal(routeModeForPair("bicycling", { lng: 123, lat: 41 }, { lng: 123.1, lat: 41 }), "bicycling");
});
