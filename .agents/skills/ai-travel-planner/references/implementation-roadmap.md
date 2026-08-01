# Reproduction roadmap

## Phase 0 — Foundation

Deliverables:

- renamed `ai-travel-planner` Skill;
- one `trip.json` contract;
- validator, route optimizer, GeoJSON/card renderer;
- AMap MCP bridge and REST fallback;
- project document and acceptance tests.

Exit criteria: sample data validates and renders without network access; live connector reports a clear missing-key state.

## Phase 1 — Real POI MVP

1. Create an AMap Web Service Key.
2. Export it as `AMAP_MAPS_API_KEY`.
3. Run bridge `doctor`, `list-tools`, and one `maps_text_search` call.
4. Add candidate extraction and POI matching.
5. Persist provider id, GCJ-02 coordinate, address, type and verification time.

Exit criteria: every scheduled stop is either `verified` or visibly `needs_confirmation`; no untyped coordinates.

## Phase 2 — Executable routes

1. Build day clustering and time budgets.
2. Query a distance matrix for candidate ordering.
3. Preserve hotel anchors and locked stops.
4. Run nearest-neighbor + 2-opt.
5. Request each final route segment from AMap.

Exit criteria: consecutive stops match route endpoints; daily time budget includes stay and travel time; failures are marked rather than invented.

## Phase 3 — Card product

1. Render overview, day, leg and POI cards from `trip.json`.
2. Add mobile/desktop responsive layout.
3. Add selection state and day filters.
4. Add PNG export through `ljg-card` or browser screenshot.

Exit criteria: cards remain useful with the map hidden; all displayed claims trace back to structured data.

## Phase 4 — Map product

1. Choose local preview, hosted H5, or AMap private-map output.
2. Configure JSAPI Web Key and production `serviceHost` proxy.
3. Render numbered markers and route geometry.
4. Implement card-marker bidirectional interaction.
5. Add “本日 / 全程” layer switching and AMap navigation/deep links.

Exit criteria: no security code in source; map/card state stays synchronized; mobile interaction is usable.

## Phase 5 — Product expansion

- reservations, transport bookings and calendar export;
- budget and expense model;
- collaborative editing and conflict resolution;
- offline cache/PWA;
- Google/OSM provider adapters outside mainland China;
- evaluation dataset for POI matching and route feasibility.

## Test matrix

| Test | Expected result |
|---|---|
| missing key | research and skeleton work; live states remain unverified |
| ambiguous same-name POI | no automatic selection below threshold/margin |
| closed museum | warning and reschedule candidate |
| hotel anchor | route starts/ends at hotel when requested |
| flight/train segment | ground route is broken |
| route API failure | straight-line placeholder, null duration |
| mobile card click | corresponding marker selected |
| provider-id mix-up | validator rejects or adapter refuses request |
| stale verification | warning shown before departure |

## Definition of done

- The same `trip.json` produces document, cards and map data.
- At least one real AMap POI and one real route have been exercised with a user-owned key.
- Key handling, failure states and coordinate systems are documented.
- A new developer can reproduce the setup from the project document without reading TREK source.
