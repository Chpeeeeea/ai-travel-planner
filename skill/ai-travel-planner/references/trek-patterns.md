# Patterns learned from TREK

Reference project: https://github.com/liketrek/TREK

TREK is a full travel application, not a prompt-only travel Skill. Its useful contribution is the system shape:

```text
User/AI
  -> provider-backed POI search
  -> Place records
  -> Trip / Day / Assignment ordering
  -> route calculation and optimization
  -> shared client state
  -> cards, list and map views
```

## Adopt independently

- Stable `Trip -> Day -> Place -> Assignment -> RouteSegment` contract.
- Provider-aware IDs and data provenance.
- Immediate straight-line visual feedback followed by verified road geometry.
- Hotel anchors, locked stops and transport breaks.
- Nearest-neighbor followed by 2-opt for small day routes.
- Card/list and map bidirectional selection.
- Offline-friendly generated artifacts and explicit error states.

## Do not copy blindly

- TREK targets Google/OSM/OSRM; it has no native AMap or GCJ-02 path.
- Its product scope includes collaboration, reservations, budgets, PWA and many MCP tools that are not MVP requirements.
- Some wiki pages lag current source behavior.
- TREK uses AGPL-3.0. Learn its architecture and interaction model, but independently implement this Skill unless the whole downstream distribution is prepared to comply with AGPL obligations.

## Known failure lessons

- Keep provider IDs typed; otherwise one provider's id can trigger expensive failures in another provider.
- Use destination timezone for open/closed logic.
- Centralize tile/provider configuration and provide an explicit fallback.
- Store localized and original POI names where available.
- Return `null/not found` for legitimate missing provider data; reserve exceptions for actual system failures.

## What this Skill intentionally omits in the first release

- account system and multi-user collaboration
- reservation and budget management
- offline PWA cache
- booking imports and calendar sync
- full drag-and-drop planner application

Those belong in a later product layer. The Skill first guarantees real places, executable daily routes and reusable outputs.
