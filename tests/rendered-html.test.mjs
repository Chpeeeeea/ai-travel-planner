import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the platform product home", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /先把一座城市研究明白/);
  assert.match(html, /官方文旅/);
  assert.match(html, /小红书/);
  assert.match(html, /OSM/);
  assert.match(html, /20–40/);
  assert.match(html, /特别想吃/);
  assert.match(html, /必去地点/);
  assert.match(html, /锅包肉/);
  assert.match(html, /每天 N−1 段/);
  assert.match(html, /青田三日只是案例/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("server-renders the Qingtian reference case", async () => {
  const response = await render("/cases/qingtian");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /青田三日/);
  assert.match(html, /AI TRAVEL PLANNER/);
  assert.match(html, /21/);
  assert.match(html, /道路/);
  assert.match(html, /遥感/);
  assert.match(html, /研究区/);
  assert.match(html, /双击点位放大/);
  assert.match(html, /行程卡片/);
  assert.match(html, /路线地图/);
  assert.match(html, /候选地点/);
});

test("restores hidden maps and supports focused marker zoom", async () => {
  const source = await readFile(new URL("../app/AmapMap.tsx", import.meta.url), "utf8");
  const planner = await readFile(new URL("../app/Planner.tsx", import.meta.url), "utf8");
  assert.match(source, /ResizeObserver/);
  assert.match(source, /marker\.on\("dblclick"/);
  assert.match(source, /setZoomAndCenter/);
  assert.match(source, /clientWidth > 1 && container\.clientHeight > 1/);
  assert.match(source, /mapRef\.current\.on\("complete"/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /setBounds\(bounds, immediately/);
  assert.doesNotMatch(source, /map\.resize\(\)|mapRef\.current\.resize\(\)/);
  assert.match(source, /focusRevision/);
  assert.match(source, /focusWhenVisible/);
  assert.match(source, /已定位/);
  assert.match(planner, /focusPoiOnMap/);
  assert.match(planner, /setMobileView\("map"\)/);
  assert.match(planner, /在地图中查看候选地点/);
});

test("defines a destination research-area viewport", async () => {
  const trip = JSON.parse(await readFile(new URL("../cases/qingtian/trip.json", import.meta.url), "utf8"));
  assert.equal(trip.trip.city, "青田县");
  assert.equal(trip.trip.map_view.zoom, 10);
  assert.ok(trip.trip.map_view.bounds.southwest.lng < trip.trip.map_view.center.lng);
  assert.ok(trip.trip.map_view.bounds.northeast.lng > trip.trip.map_view.center.lng);
});

test("server-renders the product case study without developer-facing resume copy", async () => {
  const response = await render("/case-study");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /真正走得通的旅行/);
  assert.match(html, /21/);
  assert.match(html, /og-v2\.png/);
  assert.match(html, /候选点上图/);
  assert.doesNotMatch(html, /RESUME COPY|TREK|trip\.json|GeoJSON|旧版 Skill/);
});

test("renders a readable itinerary summary", async () => {
  const response = await render("/summary");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /青田三日/);
  assert.match(html, /太鹤公园/);
  assert.match(html, /推荐原因|从山城高点/);
});

test("downloads the Markdown summary as UTF-8 with BOM", async () => {
  const response = await render("/api/summary");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /charset=utf-8/i);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment/i);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
});

test("defines durable PlanningRun stages and protected API access", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/planning-runs/route.ts", import.meta.url), "utf8");
  const planningRuntime = await readFile(new URL("../platform/server/planning-runtime.ts", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0000_careless_enchantress.sql", import.meta.url), "utf8");
  for (const table of ["planning_runs", "planning_briefs", "research_evidence", "candidates", "provider_matches", "itinerary_days", "assignments", "route_segments", "planning_run_events"]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.equal(hosting.d1, "DB");
  assert.match(planningRuntime, /PLANNING_RUN_WRITE_TOKEN/);
  assert.match(api, /Invalid stage transition/);
  assert.match(api, /providerPoiCalls/);
  assert.match(api, /providerRouteCalls/);
  assert.match(api, /must_eat/);
  assert.match(api, /must_visit/);
});

test("keeps research ingestion and candidate compilation provider-free", async () => {
  const researchApi = await readFile(new URL("../app/api/planning-runs/research/route.ts", import.meta.url), "utf8");
  const compileApi = await readFile(new URL("../app/api/planning-runs/compile/route.ts", import.meta.url), "utf8");
  const reviewApi = await readFile(new URL("../app/api/planning-runs/candidates/route.ts", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../platform/runtime/research.mjs", import.meta.url), "utf8");
  assert.match(researchApi, /evidence batches are limited to 100 items/);
  assert.match(researchApi, /poiCalls: 0/);
  assert.match(compileApi, /currentStage !== "researching"/);
  assert.match(compileApi, /Math\.min\(40, run\.candidateMax\)/);
  assert.match(compileApi, /poiCalls: 0/);
  assert.match(reviewApi, /sent_to_amap/);
  assert.doesNotMatch(runtime, /AMAP_|restapi\.amap|webapi\.amap|maps_text_search|provider_poi_id|\blng\b|\blat\b/);
});

test("separates shortlist verification, scheduling, adjacent routing and trip assembly", async () => {
  const verifyApi = await readFile(new URL("../app/api/planning-runs/verify/route.ts", import.meta.url), "utf8");
  const scheduleApi = await readFile(new URL("../app/api/planning-runs/schedule/route.ts", import.meta.url), "utf8");
  const routesApi = await readFile(new URL("../app/api/planning-runs/routes/route.ts", import.meta.url), "utf8");
  const tripApi = await readFile(new URL("../app/api/planning-runs/trip/route.ts", import.meta.url), "utf8");
  const provider = await readFile(new URL("../platform/server/amap-provider.ts", import.meta.url), "utf8");
  assert.match(verifyApi, /Math\.min\(5/);
  assert.match(verifyApi, /needs_confirmation/);
  assert.match(verifyApi, /providerPoiCalls: run\.providerPoiCalls \+ calls/);
  assert.match(scheduleApi, /All shortlist candidates must finish POI verification/);
  assert.match(scheduleApi, /dailyMinimum: run\.dailyStopsMin/);
  assert.match(scheduleApi, /provider_calls: 0/);
  assert.match(routesApi, /ordered\.length - 1/);
  assert.match(routesApi, /Math\.min\(5/);
  assert.match(routesApi, /fallback_straight_line/);
  assert.match(tripApi, /schema_version: "1\.0"/);
  assert.match(tripApi, /map_view: mapView\(points\)/);
  assert.match(provider, /\/v5\/place\/text/);
  assert.match(provider, /\/v5\/direction\//);
  assert.doesNotMatch(scheduleApi, /searchAmapPlaces|requestAmapRoute|restapi\.amap/);
});
