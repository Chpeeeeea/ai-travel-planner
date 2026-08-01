import assert from "node:assert/strict";
import test from "node:test";
import { buildTripDocument, tripToGeoJson, tripToMarkdown } from "../platform/runtime/trip.mjs";

test("assembles a destination-agnostic Trip document for cards and maps", () => {
  const run = {
    id: "run-shenyang",
    destination: "沈阳",
    days: 2,
    currentStage: "published",
    status: "complete",
    providerPoiCalls: 4,
    providerRouteCalls: 1,
    updatedAt: "2026-08-01T12:00:00Z",
  };
  const candidates = [
    ["a", "沈阳故宫", "历史遗迹"],
    ["b", "张学良旧居", "历史遗迹"],
    ["c", "西塔美食街", "地方美食"],
    ["d", "同名候选", "在地生活"],
  ].map(([id, canonicalName, theme], index) => ({
    id,
    canonicalName,
    aliasesJson: "[]",
    themesJson: JSON.stringify([theme]),
    whyVisit: `${canonicalName}的推荐理由`,
    watchForJson: JSON.stringify(["现场看点"]),
    stayMinutes: 60,
    verificationStatus: index < 3 ? "verified" : "needs_confirmation",
  }));
  const matches = candidates.slice(0, 3).map((candidate, index) => ({
    candidateId: candidate.id,
    status: "verified",
    providerPoiId: `amap-${candidate.id}`,
    address: `沈阳市地址${index + 1}`,
    typecode: "110000",
    lng: 123.43 + index * 0.02,
    lat: 41.8 + index * 0.01,
    matchConfidence: 0.95,
    verifiedAt: "2026-08-01T10:00:00Z",
    rawJson: JSON.stringify({ adcode: "210100", business: { rating: "4.8", openToday: "09:00-17:00" } }),
  }));
  const days = [
    { id: "day-1", dayNumber: 1, title: "宫城与近代史", windowStart: "09:00", windowEnd: "18:00" },
    { id: "day-2", dayNumber: 2, title: "街区与味道", windowStart: "09:00", windowEnd: "18:00" },
  ];
  const assignments = [
    { id: "as-a", dayId: "day-1", candidateId: "a", orderIndex: 0, arrivalTime: "09:00", departureTime: "10:30", locked: false, notes: "" },
    { id: "as-b", dayId: "day-1", candidateId: "b", orderIndex: 1, arrivalTime: "11:00", departureTime: "12:30", locked: false, notes: "" },
    { id: "as-c", dayId: "day-2", candidateId: "c", orderIndex: 0, arrivalTime: "11:30", departureTime: "13:00", locked: false, notes: "" },
  ];
  const segments = [{
    dayId: "day-1",
    fromAssignmentId: "as-a",
    toAssignmentId: "as-b",
    mode: "walking",
    provider: "amap-webservice-v5",
    distanceM: 1300,
    durationS: 1080,
    geometryJson: "[[123.43,41.8],[123.45,41.81]]",
    status: "verified",
    verifiedAt: "2026-08-01T11:00:00Z",
  }];

  const trip = buildTripDocument({
    run,
    brief: { transport_mode: "mixed", daily_window: { start: "09:00", end: "18:00" } },
    candidates,
    matches,
    days,
    assignments,
    segments,
    evidence: [{ sourceKind: "official" }, { sourceKind: "xiaohongshu" }],
  });

  assert.equal(trip.trip.title, "沈阳2日旅行");
  assert.equal(trip.days.length, 2);
  assert.equal(trip.days[0].route_segments[0].from_poi_id, "a");
  assert.equal(trip.days[0].route_segments[0].to_poi_id, "b");
  assert.equal(trip.pois.find((poi) => poi.id === "d").assignment_status, "candidate");
  assert.equal(trip.pois.find((poi) => poi.id === "a").business.rating, 4.8);
  assert.equal(trip.quality.verified_poi_count, 3);
  assert.equal(trip.quality.verified_route_count, 1);
  assert.equal(trip.quality.unverified_poi_count, 1);
  assert.match(trip.quality.warnings[0], /1 个候选地点/);
  assert.deepEqual(trip.provenance.research_source_kinds.sort(), ["official", "xiaohongshu"]);
  assert.ok(trip.trip.map_view.bounds.southwest.lng < trip.trip.map_view.center.lng);

  const markdown = tripToMarkdown(trip);
  assert.match(markdown, /沈阳2日旅行/);
  assert.match(markdown, /Day 1/);
  assert.match(markdown, /推荐原因/);
  assert.match(markdown, /1\.3 公里/);

  const geojson = tripToGeoJson(trip);
  assert.equal(geojson.coordinate_system, "GCJ-02");
  assert.equal(geojson.features.filter((feature) => feature.geometry.type === "Point").length, 3);
  assert.equal(geojson.features.filter((feature) => feature.geometry.type === "LineString").length, 1);
  assert.equal(geojson.features.some((feature) => feature.id === "d"), false);
});
