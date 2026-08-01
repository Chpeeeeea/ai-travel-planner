# Trip data contract

`trip.json` is the source of truth for research, scheduling, routing, cards, maps and exports.

## Top-level shape

```json
{
  "schema_version": "1.0",
  "trip": {},
  "pois": [],
  "days": [],
  "provenance": {},
  "quality": {}
}
```

## `trip`

Required fields:

- `id`: stable slug or UUID.
- `title`, `city`, `timezone`.
- `coordinate_system`: `GCJ-02` for AMap-first trips.
- `start_date`, `end_date`: ISO date or `null`.
- `default_mode`: `walking`, `driving`, `bicycling`, `transit` or `mixed`.
- `daily_window`: `{ "start": "09:00", "end": "18:00" }`.
- `hotel_poi_id`: optional internal POI id.
- `assumptions`: explicit planning assumptions.

## `pois[]`

```json
{
  "id": "poi-forbidden-city",
  "provider": "amap",
  "provider_poi_id": "highde-id-or-null",
  "name": "故宫博物院",
  "aliases": [],
  "address": "",
  "adcode": "",
  "typecode": "",
  "location": {"lng": 116.0, "lat": 39.0, "coord_system": "GCJ-02"},
  "business": {"rating": null, "cost": null, "open_hours": null},
  "photos": [],
  "content": {"why_visit": "", "watch_for": [], "stay_minutes": 120},
  "verification": {
    "status": "candidate",
    "verified_at": null,
    "query": "故宫博物院",
    "match_confidence": null,
    "source_url": null
  }
}
```

### POI verification states

- `candidate`: research candidate, not checked against a provider.
- `needs_confirmation`: provider returned ambiguous matches.
- `verified`: provider id and coordinates were confirmed.
- `stale`: previously verified but time-sensitive fields need refresh.
- `rejected`: explicitly ruled out.

Only `verified` POIs may be described as “高德真实 POI”. Coordinates on candidates are optional; if present from a non-AMap source, record the actual coordinate system and source.

## `days[]`

```json
{
  "id": "day-1",
  "day_number": 1,
  "date": null,
  "title": "中轴线与宫城",
  "window": {"start": "09:00", "end": "18:00"},
  "start_anchor_poi_id": null,
  "end_anchor_poi_id": null,
  "assignments": [
    {
      "poi_id": "poi-forbidden-city",
      "order_index": 0,
      "arrival_time": null,
      "departure_time": null,
      "locked": false,
      "notes": ""
    }
  ],
  "route_segments": []
}
```

## `route_segments[]`

```json
{
  "from_poi_id": "poi-a",
  "to_poi_id": "poi-b",
  "mode": "walking",
  "provider": "amap-mcp",
  "distance_m": 1200,
  "duration_s": 960,
  "geometry": [[116.0, 39.0], [116.1, 39.1]],
  "status": "verified",
  "verified_at": "2026-07-31T12:00:00+08:00",
  "summary": ""
}
```

Route status values:

- `pending`: endpoints known, route not requested.
- `verified`: returned by a route provider.
- `fallback_straight_line`: visual placeholder only; `duration_s` must be `null`.
- `failed`: route provider failed and no visual fallback was created.
- `transport_break`: flight/train/intercity segment intentionally breaks ground routing.

## `provenance`

Record research and live-service lineage separately:

```json
{
  "research_sources": [],
  "poi_provider": "amap-mcp",
  "route_provider": "amap-mcp",
  "generated_at": "",
  "updated_at": ""
}
```

## `quality`

```json
{
  "status": "draft",
  "warnings": [],
  "unverified_poi_count": 0,
  "pending_route_count": 0
}
```

Quality status values: `draft`, `needs_input`, `verified`, `stale`.

## Invariants

1. Internal POI ids are unique and stable; provider ids are namespaced by `provider`.
2. Every assignment references an existing POI.
3. Assignment `order_index` is unique within a day and starts at zero.
4. Every route segment joins consecutive assignments or explicit anchors.
5. AMap coordinates are GCJ-02 end-to-end.
6. `verified` POIs require `provider_poi_id`, coordinates and `verified_at`.
7. `fallback_straight_line` never has a fabricated duration.
8. Ratings, hours and costs are time-sensitive; preserve `verified_at` and recheck near departure.
