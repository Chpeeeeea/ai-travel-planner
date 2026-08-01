# AMap integration

## Integration order

Use the first available route:

1. Directly exposed AMap MCP tools in the current agent session.
2. Local stdio bridge to the official npm package.
3. AMap Web Service REST for deterministic batch jobs.
4. Research-only skeleton with `needs_verification` status.

Do not silently replace high-quality AMap results with invented or memory-based coordinates.

## Local key setup

Run the Windows setup launcher:

```powershell
scripts\配置高德密钥.cmd
```

It prompts without echoing input and configures:

| Console credential | Environment variable | Purpose |
|---|---|---|
| Web Service Key | `AMAP_MAPS_API_KEY` and `AMAP_WEBSERVICE_KEY` | MCP, POI, details and routes |
| Web JSAPI Key | `AMAP_JSAPI_KEY` | browser map loader |
| JSAPI `securityJsCode` | `AMAP_SECURITY_JS_CODE` | JSAPI authentication; must match the JSAPI Key |

User-scoped Windows environment variables persist across Codex restarts but are not an encrypted secret vault. Do not use them on a shared Windows account. For a temporary session, run `configure_amap_keys.ps1 -Scope Process` and launch consumers from that process.

## Official MCP connection

The official service supports Streamable HTTP:

```text
https://mcp.amap.com/mcp?key=<AMAP Web Service Key>
```

The local stdio package is:

```powershell
$env:AMAP_MAPS_API_KEY="..."
npx.cmd -y @amap/amap-maps-mcp-server
```

Node.js 22.14 or newer is required by the official setup guide. Keep the key in environment/secret storage, not in committed MCP JSON or project output.

## Core MCP tools

The currently published stdio package exposes these stable core tools:

| Purpose | Tool |
|---|---|
| geocode | `maps_geo` |
| reverse geocode | `maps_regeocode` |
| keyword POI search | `maps_text_search` |
| nearby POI search | `maps_around_search` |
| POI detail | `maps_search_detail` |
| walking route | `maps_direction_walking` |
| driving route | `maps_direction_driving` |
| cycling route | `maps_bicycling` |
| transit route | `maps_direction_transit_integrated` |
| distance matrix | `maps_distance` |
| weather | `maps_weather` |

Remote MCP may expose newer tools such as private/personal maps, navigation or taxi deep links. Always call `tools/list` instead of assuming they exist. Use them as optional presentation/export capabilities, not as the source of truth for the itinerary.

## Local bridge

`scripts/amap_mcp_bridge.py` starts the official package over stdio, performs MCP initialization, lists tools and calls a selected tool.

```powershell
python scripts/amap_mcp_bridge.py doctor
python scripts/amap_mcp_bridge.py list-tools
python scripts/amap_mcp_bridge.py call maps_text_search --arguments '{"keywords":"故宫博物院","city":"北京","citylimit":true}'
```

The bridge writes MCP protocol traffic only to process pipes. It masks key presence in diagnostics and never prints the key.

## REST fallback

`scripts/amap_rest.py` uses `AMAP_WEBSERVICE_KEY` or `AMAP_MAPS_API_KEY` and the current Web Service endpoints.

Examples:

```powershell
python scripts/amap_rest.py poi-text --keywords "故宫博物院" --region "北京" --output poi.json
python scripts/amap_rest.py poi-detail --id "AMAP_POI_ID" --output detail.json
python scripts/amap_rest.py route --mode walking --origin "116.397,39.909" --destination "116.407,39.919" --output route.json
```

REST is an adapter, not a second business model. Normalize its response into the shared trip contract.

## POI matching

Suggested score:

- exact normalized name: +0.45
- alias match: +0.30
- same city/adcode: +0.20
- expected typecode family: +0.15
- address landmark/district match: +0.15
- implausible distance or conflicting district: −0.30

Cap the score at 1.00. Auto-select only when score is at least 0.80 and the margin over the next candidate is at least 0.15.

Provider identifiers are typed. Never send an OSM/Google/internal id to AMap detail or photo endpoints.

## Coordinates

- AMap POI and route coordinates are GCJ-02.
- Store longitude before latitude.
- GeoJSON normally implies WGS84. This Skill preserves `coord_system` metadata and emits a warning when exporting GCJ-02 coordinates without conversion.
- Use AMap coordinate conversion or a reviewed conversion implementation when interchanging with OSM/GPS.

## JSAPI map

Interactive maps require a Web JSAPI Key and security configuration. Production must use `serviceHost` proxying so `securityJsCode` is not exposed. Load only required plugins and call `map.destroy()` on teardown.

## Failure policy

- `INVALID_USER_KEY`: stop live calls and report key type/expiry problem.
- quota/rate limit: cache successful data, back off and preserve pending items.
- empty POI result: retry once with a shorter canonical name and city limit.
- multiple plausible POIs: require confirmation.
- route failure: preserve endpoints, set `fallback_straight_line`, leave duration null.
- stale hours/rating: mark stale rather than deleting historical evidence.

## Sources

- MCP setup: https://lbs.amap.com/api/mcp-server/gettingstarted
- MCP overview: https://lbs.amap.com/api/mcp-server/summary
- MCP travel case: https://lbs.amap.com/api/mcp-server/application-case/travel-planning-case
- POI 2.0: https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch
- Directions: https://lbs.amap.com/api/webservice/guide/api/direction
- JSAPI security: https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode
- Coordinate conversion: https://lbs.amap.com/api/webservice/guide/api/convert
- Static map: https://lbs.amap.com/api/webservice/guide/api/staticmaps
