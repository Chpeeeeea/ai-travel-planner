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

test("server-renders the resume-ready case study", async () => {
  const response = await render("/case-study");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /把 AI 攻略，重构成/);
  assert.match(html, /19/);
  assert.match(html, /og-v2\.png/);
  assert.match(html, /RESUME COPY/);
});
