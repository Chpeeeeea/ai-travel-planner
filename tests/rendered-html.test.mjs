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
  assert.match(source, /ResizeObserver/);
  assert.match(source, /marker\.on\("dblclick"/);
  assert.match(source, /setZoomAndCenter/);
  assert.match(source, /clientWidth > 1 && container\.clientHeight > 1/);
  assert.match(source, /mapRef\.current\.on\("complete"/);
  assert.match(source, /requestAnimationFrame/);
  assert.doesNotMatch(source, /map\.resize\(\)|mapRef\.current\.resize\(\)/);
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
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0000_careless_enchantress.sql", import.meta.url), "utf8");
  for (const table of ["planning_runs", "planning_briefs", "research_evidence", "candidates", "provider_matches", "itinerary_days", "assignments", "route_segments", "planning_run_events"]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.equal(hosting.d1, "DB");
  assert.match(api, /PLANNING_RUN_WRITE_TOKEN/);
  assert.match(api, /Invalid stage transition/);
  assert.match(api, /providerPoiCalls/);
  assert.match(api, /providerRouteCalls/);
});
