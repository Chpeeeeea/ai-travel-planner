import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/", extraHeaders = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html", ...extraHeaders } }),
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
  assert.match(html, /建筑漫步/);
  assert.match(html, /博物馆/);
  assert.match(html, /亲子家庭/);
  assert.match(html, /户外运动/);
  assert.match(html.replaceAll("<!-- -->", ""), /已选 4\/8/);
  assert.match(html, /锅包肉/);
  assert.match(html, /进入旅行研究工作台/);
  assert.match(html, /每天 N−1 段/);
  assert.match(html, /青田三日只是案例/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("sign-in gates the traveler research studio", async () => {
  const response = await render("/studio?destination=青田县&days=3");
  assert.ok([302, 303, 307, 308].includes(response.status));
  assert.match(response.headers.get("location") ?? "", /\/signin-with-chatgpt\?/);
  assert.match(response.headers.get("location") ?? "", /return_to=/);
});

test("sign-in gates dynamic traveler card maps", async () => {
  const response = await render("/trip?run_id=run-123");
  assert.ok([302, 303, 307, 308].includes(response.status));
  assert.match(response.headers.get("location") ?? "", /\/signin-with-chatgpt\?/);
  assert.match(response.headers.get("location") ?? "", /return_to=/);
});

test("sign-in gates traveler POI disambiguation", async () => {
  const response = await render("/disambiguation?run_id=run-123");
  assert.ok([302, 303, 307, 308].includes(response.status));
  assert.match(response.headers.get("location") ?? "", /\/signin-with-chatgpt\?/);
  assert.match(response.headers.get("location") ?? "", /return_to=/);
});

test("server-renders the signed-in traveler research studio", async () => {
  const response = await render("/studio?destination=青田县&days=3&must_eat=田鱼", {
    "oai-authenticated-user-id": "test-user",
    "oai-authenticated-user-email": "traveler@example.com",
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /把一次旅行，做成可恢复的研究任务/);
  assert.match(html, /创建 PlanningRun/);
  assert.match(html, /20–40 个/);
  assert.match(html, /建筑漫步/);
  assert.match(html.replaceAll("<!-- -->", ""), /已选 4\/8/);
  assert.match(html, /青田只是案例/);
  assert.match(html, /田鱼/);
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
  const briefRuntime = await readFile(new URL("../platform/runtime/brief.mjs", import.meta.url), "utf8");
  const planningRuntime = await readFile(new URL("../platform/server/planning-runtime.ts", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0000_careless_enchantress.sql", import.meta.url), "utf8");
  const ownerMigration = await readFile(new URL("../drizzle/0001_cheerful_nuke.sql", import.meta.url), "utf8");
  for (const table of ["planning_runs", "planning_briefs", "research_evidence", "candidates", "provider_matches", "itinerary_days", "assignments", "route_segments", "planning_run_events"]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.equal(hosting.d1, "DB");
  assert.match(schema, /ownerUserId/);
  assert.match(ownerMigration, /owner_user_id/);
  assert.match(ownerMigration, /idx_planning_runs_owner_updated/);
  assert.match(planningRuntime, /PLANNING_RUN_WRITE_TOKEN/);
  assert.match(api, /Invalid stage transition/);
  assert.match(api, /providerPoiCalls/);
  assert.match(api, /providerRouteCalls/);
  assert.match(briefRuntime, /must_eat/);
  assert.match(briefRuntime, /must_visit/);
});

test("exposes an identity-scoped traveler API without browser secrets", async () => {
  const api = await readFile(new URL("../app/api/trips/route.ts", import.meta.url), "utf8");
  const tripProxy = await readFile(new URL("../app/api/trips/trip/route.ts", import.meta.url), "utf8");
  const tripPage = await readFile(new URL("../app/trip/page.tsx", import.meta.url), "utf8");
  const itineraryApi = await readFile(new URL("../app/api/trips/itinerary/route.ts", import.meta.url), "utf8");
  const exportApi = await readFile(new URL("../app/api/trips/export/route.ts", import.meta.url), "utf8");
  const disambiguationApi = await readFile(new URL("../app/api/trips/disambiguation/route.ts", import.meta.url), "utf8");
  const disambiguationPage = await readFile(new URL("../app/disambiguation/page.tsx", import.meta.url), "utf8");
  const disambiguationPanel = await readFile(new URL("../app/disambiguation/DisambiguationPanel.tsx", import.meta.url), "utf8");
  const tripAssembler = await readFile(new URL("../platform/server/trip-assembler.ts", import.meta.url), "utf8");
  const planner = await readFile(new URL("../app/Planner.tsx", import.meta.url), "utf8");
  const studio = await readFile(new URL("../app/studio/TravelStudio.tsx", import.meta.url), "utf8");
  assert.match(api, /getChatGPTUser/);
  assert.match(api, /eq\(planningRuns\.ownerUserId, user\.userId\)/);
  assert.match(api, /Cross-origin writes are not allowed/);
  assert.match(api, /created_by_traveler/);
  assert.match(tripProxy, /eq\(planningRuns\.ownerUserId, user\.userId\)/);
  assert.match(tripProxy, /assembleTrip/);
  assert.doesNotMatch(tripProxy, /PLANNING_RUN_WRITE_TOKEN|authorization:/i);
  assert.match(tripPage, /requireChatGPTUser/);
  assert.match(tripPage, /eq\(planningRuns\.ownerUserId, user\.userId\)/);
  assert.match(tripPage, /\["scheduled", "routing", "published"\]/);
  assert.match(tripPage, /<Planner/);
  assert.match(tripPage, /editableRunId=\{runId\}/);
  assert.match(tripPage, /exportBaseHref=/);
  assert.match(tripAssembler, /buildTripDocument/);
  assert.match(planner, /data\.days\.length/);
  assert.match(planner, /new Set\(data\.pois\.flatMap/);
  assert.match(planner, /brandMark/);
  assert.doesNotMatch(planner, /<div className="brand-mark">青<\/div>/);
  assert.match(planner, /fetch\("\/api\/trips\/itinerary"/);
  assert.match(planner, /persistenceQueue/);
  assert.match(itineraryApi, /eq\(planningRuns\.ownerUserId, user\.userId\)/);
  assert.match(itineraryApi, /Cross-origin writes are not allowed/);
  assert.match(itineraryApi, /Every itinerary place must be a verified POI with GCJ-02 coordinates/);
  assert.match(itineraryApi, /db\.delete\(routeSegments\)/);
  assert.match(itineraryApi, /currentStage: "scheduled", status: "queued"/);
  assert.match(itineraryApi, /db\.batch/);
  assert.match(exportApi, /eq\(planningRuns\.ownerUserId, user\.userId\)/);
  assert.match(exportApi, /tripToMarkdown/);
  assert.match(exportApi, /tripToGeoJson/);
  assert.match(exportApi, /\\uFEFF/);
  assert.match(exportApi, /application\/geo\+json/);
  assert.match(disambiguationApi, /eq\(planningRuns\.ownerUserId, user\.userId\)/);
  assert.match(disambiguationApi, /Cross-origin writes are not allowed/);
  assert.match(disambiguationApi, /candidate\.verificationStatus !== "needs_confirmation"/);
  assert.match(disambiguationApi, /status: remaining \? "awaiting_confirmation" : "queued"/);
  assert.match(disambiguationApi, /provider_calls: 0/);
  assert.match(disambiguationPage, /requireChatGPTUser/);
  assert.match(disambiguationPanel, /在高德查看/);
  assert.match(disambiguationPanel, /选择此地点/);
  assert.match(disambiguationPanel, /排除此候选/);
  assert.match(studio, /\/disambiguation\?run_id=/);
  assert.match(studio, /setTimeout\(poll, 5000\)/);
  assert.match(studio, /Research Worker/);
  assert.match(studio, /任务已进入持久化队列/);
  assert.match(studio, /research_lanes/);
  assert.match(studio, /\/trip\?run_id=/);
  assert.match(studio, /打开卡片地图/);
  assert.doesNotMatch(studio, /AMAP_WEBSERVICE_KEY|PLANNING_RUN_WRITE_TOKEN|authorization:/i);
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
  const tripRuntime = await readFile(new URL("../platform/runtime/trip.mjs", import.meta.url), "utf8");
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
  assert.match(tripApi, /assembleTrip/);
  assert.match(tripRuntime, /schema_version: "1\.0"/);
  assert.match(tripRuntime, /map_view: tripMapView\(points\)/);
  assert.match(provider, /\/v5\/place\/text/);
  assert.match(provider, /\/v5\/direction\//);
  assert.doesNotMatch(scheduleApi, /searchAmapPlaces|requestAmapRoute|restapi\.amap/);
});
