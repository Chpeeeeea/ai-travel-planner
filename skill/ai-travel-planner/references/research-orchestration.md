# Multi-topic research orchestration

## When to split

Use independent research lanes when any condition is true:

- the trip is two days or longer and spans at least three themes;
- the user asks for deep research, several platforms, or parallel agents;
- one destination needs both historical interpretation and current venue/food evidence.

For a simple one-day route or fewer than five candidate stops, research locally without spawning agents.

## Default lanes

| Lane | Scope | Default artifact |
|---|---|---|
| history | chronology, migration, people, historic sites | `research/01-history.md` |
| culture | heritage, museums, local life, crafts, rituals | `research/02-culture.md` |
| scenery | urban landscape, nature, season, safety, access | `research/03-scenery.md` |
| food | local dishes, restaurants, cafés, food customs | `research/04-food.md` |

Add practical transport, reservation, weather, family or accessibility lanes only when the brief needs them. Merge adjacent lanes when concurrency is limited; do not omit the subject.

## Agent contract

Give every research Agent the normalized travel brief and exactly one lane. Require it to:

1. use `vibe-web-research` in read-only `search` mode for platform discovery;
2. prefer official government, destination, venue and operator pages for facts;
3. open and verify the strongest candidate sources;
4. keep facts, platform opinions and inference visibly separate;
5. produce one Markdown document with narrative, `watch_for`, timing/risk notes, sources and a candidate POI table;
6. leave provider IDs, coordinates and route claims empty for the main Agent to verify.

Research Agents must not call AMap concurrently. The main Agent owns provider calls so personal-key QPS, retries, cache and POI matching remain deterministic.

## Platform presets

- China county/city travel: Xiaohongshu and Douyin for firsthand discovery; local government, culture-tourism and venue pages for facts; Toutiao/local media as secondary context; Bilibili only when long-form material adds value.
- Museum/heritage: official venue and government sources first; social platforms only for visitor friction and现场观察点.
- Food: platform posts generate dish/store candidates; AMap verifies the business entity; current hours and closures remain time-sensitive.

Record blocked or partial platform coverage instead of bypassing login, CAPTCHA or page controls.

## Compile phase

The main Agent compiles rather than concatenates:

1. normalize names and aliases;
2. merge the same place across lanes while preserving every source and theme;
3. reject evidence-free or closed candidates;
4. rank by brief fit, source confidence, geographic diversity and time cost;
5. send the reduced candidate pool to AMap text search and detail matching;
6. write verified entities once into `trip.json` and reference them by internal ID from every day.

默认使用 `scripts/planning_pipeline.py compile` 完成名称归一化、别名合并、来源多样性和兴趣匹配评分。输出限制为 20–40 个；编译结果必须通过 `audit`，确保候选阶段没有高德 ID 或最终坐标。

The topic documents remain readable research artifacts. `trip.json` remains the only source of truth for scheduling, routing, cards and maps.
