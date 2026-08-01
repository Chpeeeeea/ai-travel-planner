# Card-first map design

## Product decision

Cards are the primary reading and export format. The map is a linked spatial view, not a decorative image and not the only interface.

## Desktop layout

```text
+----------------------+------------------------------+------------------+
| Day cards            | Interactive map              | Candidate POIs   |
| - day summary        | - numbered markers           | - verified       |
| - ordered stops      | - selected-day route         | - unassigned     |
| - leg time/distance  | - fit view / day layers      | - ambiguity      |
+----------------------+------------------------------+------------------+
```

## Mobile layout

- Top segmented control: `卡片 | 地图`.
- Cards are vertically scrollable; day tabs remain sticky.
- Map view has a bottom sheet containing the selected POI card.
- Selecting a card pans and highlights the marker.
- Selecting a marker opens the corresponding card and preserves day context.

## Card set

1. Trip overview card: dates, city, trip rhythm, verified/pending counts.
2. Day card: theme, time window, ordered stops and totals.
3. Leg row: mode, distance, duration and verification state.
4. POI card: photo, address, why visit, what to notice, stay time, hours and source status.
5. Warning card: ambiguity, reservation, closure or stale data.

## Map states

- `verified_route`: solid route line from provider geometry/JSAPI calculation.
- `pending_route`: muted dotted connector.
- `fallback_straight_line`: dashed line plus “路线待核验”.
- `transport_break`: no ground connector; display transport icon and label.
- selected POI: larger numbered marker and matching card accent.

## Static export

Each Day card may include a static map thumbnail. If a real base map cannot be generated safely, show a coordinate-derived schematic and label it “路线示意”，never “高德实景路线”.

PNG cards should not contain API keys or dynamic URLs with secrets. Prefer a short “在高德打开” link or QR code generated from a share/deep link.

## Interactive implementation

For AMap JSAPI v2.0:

- Load the Web key at runtime.
- Use a production `serviceHost` proxy for the security code.
- Use numbered `Marker` elements for day order.
- Use `Polyline` for saved geometry; if geometry is absent, call the relevant JSAPI routing plugin.
- Use explicit click handlers to synchronize marker and card selection.
- Fit view when switching days.
- Destroy the map and unbind handlers on teardown.

### Editable route behavior

- Verified but unassigned candidates with coordinates must also appear on the map, using a marker style distinct from scheduled stops.
- Candidates without a verified coordinate stay in the list with a disabled insert action; never invent a map position.
- Support “insert into current day” by testing every insertion boundary and choosing the smallest added detour as the default position.
- The user can still move a stop up/down, remove it, or restore the default day. Any structural change invalidates saved adjacent segments and triggers fresh JSAPI routing.
- Recalculate road geometry after insert, remove or reorder. Until the response returns, show a calculating state instead of stale distance/time.
- Marker selection and card selection share one state, but selecting a marker must not itself recalculate the route.

### POI detail disclosure

Every scheduled card needs a visible expand/collapse control. The expanded area includes:

- why this stop is in the itinerary;
- concrete things to notice on site;
- suggested stay time;
- opening or reservation warning;
- assignment-specific planning note.

Do not hide the only recommendation explanation behind hover or selection-only styling.

### Readable summary export

- Provide a browser-readable HTML summary as the default product surface.
- Markdown downloads must explicitly use `text/markdown; charset=utf-8` and include a UTF-8 BOM when Windows users may open them directly.
- Do not make raw JSON or GeoJSON the primary call to action in the consumer-facing product; keep them in a technical/export area when needed.

## MVP choice

Start with:

- responsive card HTML;
- a keyless schematic route panel;
- GeoJSON export;
- optional AMap share/private-map link when MCP exposes it.

Then add full JSAPI map after the user chooses deployment and key-security strategy.
