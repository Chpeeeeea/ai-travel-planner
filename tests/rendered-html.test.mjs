import assert from "node:assert/strict";
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

test("server-renders the Qingtian travel planner", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /青田三日/);
  assert.match(html, /AI TRAVEL PLANNER/);
  assert.match(html, /19/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("server-renders the product case study without developer-facing resume copy", async () => {
  const response = await render("/case-study");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /真正走得通的旅行/);
  assert.match(html, /19/);
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
