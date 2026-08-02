---
name: ai-travel-planner
description: "Research-first travel planning platform workflow that compiles official tourism, Xiaohongshu, OSM and multi-topic evidence into a deduplicated shortlist, verifies only final AMap POIs, schedules 4–6 places per day, calculates adjacent routes, and renders card-first maps. Use for 旅行规划、目的地研究、出发前功课、真实 POI 核验、高德路线、行程卡片、地图可视化，或将旅行研究流程产品化。"
---

# AI Travel Planner

把“为什么值得去”的内容研究，与“地点真实、路线可走、结果可携带”的旅行执行系统接起来。

平台规划运行保留 `brief → researching → shortlisted → verifying → scheduled → routing → published` 七阶段；离线产物仍保留 Brief、研究证据、候选池、已核验地点和最终 `trip.json`。`trip.json` 是日程、卡片、地图、GeoJSON 与导航链接的唯一事实源；上游阶段不得越权写入下游供应商数据。

## 核心原则

1. 先研究，再核验 POI，再编排行程；不要让模型直接编造地点 ID、坐标、营业时间或路程。
2. 中国大陆默认使用高德和 GCJ-02。原始坐标必须带 `coord_system`，跨地图导出时显式转换。
3. 高德 MCP 是首选实时能力；本地 MCP bridge 是可执行连接器；REST 仅用于批处理或 MCP 不可用时的降级。
4. 卡片是主输出，地图是空间验证与交互层。静态卡片中放路线缩略图，完整交互放在独立地图视图。
5. 外部服务失败时保留已有数据并标注状态，不伪造耗时、距离、开放时间或路线 geometry。
6. 高德不是发现引擎：研究阶段保持 0 次高德调用，只核验去重评分后的 20–40 个候选，只计算每日相邻行程点。
7. 平台模式下服从服务端用户配额；收到 `quota_exceeded` 时释放为 `awaiting_quota`，不重试、不绕过，也不创建新的配额 Skill。

## 开始前读取

按任务需要读取，不要一次加载所有参考文件：

- 数据字段、状态机和校验：`references/data-contract.md`
- MCP、REST、密钥和高德工具映射：`references/amap-integration.md`
- 卡片与地图的页面结构：`references/card-map-design.md`
- 多主题子 Agent、研究文档和编译规则：`references/research-orchestration.md`
- TREK 中可复用与不可照搬的模式：`references/trek-patterns.md`
- 复刻路线图和验收标准：`references/implementation-roadmap.md`
- 平台分层、运行状态与服务边界：`references/platform-product.md`

## 输入契约

最少需要城市或区域。优先从用户消息推断，其余使用保守默认值并在交付中列出假设：

| 输入 | 默认值 |
|---|---|
| 城市/区域 | 必填 |
| 日期或天数 | 1 天 |
| 兴趣主题 | 默认历史遗迹、文化非遗、自然风景、地方美食；从五类 38 项目录中最多选择 8 项 |
| 特别想吃 `must_eat` | 无；多个菜品或店铺需求分别记录 |
| 每日时间窗 | 09:00–18:00 |
| 强度 | 适中，每天 4–6 个主 POI |
| 交通方式 | 同片区步行，跨片区公交/打车 |
| 住宿锚点 | 未提供则不虚构 |
| 必去 `must_visit` / 排除 / 已预约 | 无 |
| 输出 | `trip.json` + Markdown + 卡片 HTML；能连高德时再生成真实路线与地图 |

只有会实质改变结果且无法安全推断的信息才询问用户。高德 Key 缺失不阻止研究和结构搭建，但必须阻止把候选地点标为“已核验”。

## 执行工作流

### 0. 建立运行目录与能力检查

1. 为本次旅行建立独立输出目录。
2. 首次使用或密钥变化时，运行 `scripts/配置高德密钥.cmd`，依次输入 Web 服务 Key、Web端 JS API Key 和配套的 `securityJsCode`。向导只把值写入本机环境变量，不写入旅行产物。
3. 检查当前工具中是否存在 `maps_text_search`、`maps_search_detail`、`maps_direction_*`、`maps_distance` 或 `personal_map`。
4. 如果高德 MCP 工具未直接暴露，运行：

```powershell
python scripts/amap_mcp_bridge.py doctor
python scripts/amap_mcp_bridge.py list-tools
```

5. bridge 读取 `AMAP_MAPS_API_KEY`，通过官方 `@amap/amap-maps-mcp-server` 发起真实 MCP 调用。绝不把 Key 写进 `trip.json`、HTML、Markdown 或日志。
6. `doctor` 失败时，继续完成研究、候选列表和空路线骨架，状态写为 `needs_verification`。

### 1. 形成旅行 Brief

把输入规范化成：目的地、日期、旅行者、兴趣、特别想吃、节奏、每日时间窗、交通偏好、住宿锚点、必去、排除、预约约束、预算提示和输出偏好。`must_eat` 与 `must_visit` 必须进入 Brief，不能只留在对话里。

先创建 `trip.json` 骨架：

```powershell
python scripts/trip_pipeline.py init --city "杭州" --days 2 --output trip.json
```

### 2. 并行做多主题研究

多日、跨主题或用户要求深度功课时，读取 `references/research-orchestration.md`，按用户选择动态拆分研究线。历史遗迹、文化非遗、自然风景、地方美食只是默认推荐；产品目录还覆盖人文城市、自然户外、吃喝生活、兴趣娱乐和旅行方式等细分主题。平台最多选择 8 项、同时运行最多 4 个 Agent；简单一日游不强制拆分。

平台发现统一调用 `vibe-web-research` 的 `search` 模式；官方网页与原始场馆来源负责事实核验。已取得的文章或视频可交给 `content-analysis`。每条研究线必须生成独立 Markdown 文档与结构化候选 POI，不直接编写最终行程，也不调用高德 Key。

主 Agent 等待各研究线完成后，统一做来源分级、别名合并、跨主题去重和候选排序，再把地点交给高德核验。研究目标不是堆景点，而是为候选 POI 补齐：

- `why_visit`：为什么值得去。
- `watch_for`：现场具体看什么。
- `stay_minutes`：合理停留时长。
- 预约、闭馆日、季节性与时段风险。

此阶段的地点只能标为 `candidate`，不能自行填写高德 POI ID 和坐标。把各研究线的结构化证据汇总为 `research-evidence.json`，再运行：

平台模式下，主 Agent 先通过 `/api/planning-runs/claim` 取得有过期时间的运行租约，再并行派发研究线。每条研究线必须独立记录 `queued/running/succeeded/failed`、尝试次数、证据数、Markdown 和错误；Worker 崩溃后新实例只重跑未成功研究线。租约 Token、执行器令牌和高德密钥不得交给研究子 Agent。

```powershell
python scripts/planning_pipeline.py compile --brief brief.json --evidence research-evidence.json --min 20 --max 40 --output candidate-pool.json
python scripts/planning_pipeline.py audit --input candidate-pool.json
```

候选不足 20 个时保留警告，不为凑数制造地点；超过 40 个时只把得分最高的 40 个送入核验。有研究证据且名称或别名命中 `must_visit` 的候选优先进入 shortlist；名称、推荐理由或现场看点命中 `must_eat` 时提高匹配分。用户约束不能绕过 POI 核验。

### 3. 用高德 MCP 对齐真实 POI

先生成受控核验清单：

```powershell
python scripts/planning_pipeline.py prepare-amap --input candidate-pool.json --output amap-verification-manifest.json
```

清单之外的地点不得调用高德。此阶段只允许文本搜索和详情核验，不允许提前计算路线。

对每个候选地点执行：

1. `maps_text_search(keywords, city, citylimit=true)` 获取候选。
2. 按名称、行政区、地址、类型和邻近关系消歧。
3. `maps_search_detail(id)` 获取详情。
4. 保存 `provider=amap`、`provider_poi_id`、GCJ-02 坐标、地址、类型、来源和 `verified_at`。
5. 置信度 `< 0.80` 或同名结果无法排除时，保留多个候选并请求确认；不要自动选第一个。

需要周边餐饮、停车、酒店或补给时，使用 `maps_around_search`，并保存中心点与半径以便复现。

### 4. 编排 Day Plan

先做约束满足，再做路径优化：

1. 把已预约和有固定开放时段的 POI 放入时间轴。
2. 依据区域聚类、停留时长和每日时间预算分天。
3. 若有酒店，将酒店设为可选起终点锚点。
4. 保留用户锁定顺序，不跨越锁定点优化。
5. 对未锁定区间运行 nearest-neighbor + 2-opt：

```powershell
python scripts/trip_pipeline.py optimize --input trip.json --output trip.optimized.json
```

从已核验候选首次生成日程时，先运行：

```powershell
python scripts/planning_pipeline.py schedule --brief brief.json --verified verified-candidates.json --stops-per-day 5 --output itinerary.json
python scripts/planning_pipeline.py audit --input itinerary.json
```

每天选择 4–6 个已核验地点；`itinerary.json` 只能产生同一天相邻点的待计算路段。

直线距离仅用于初排，不可展示为真实通勤耗时。

### 5. 计算真实路线

对同一天的相邻地点逐段调用高德 MCP：

- 步行：`maps_direction_walking`
- 驾车/打车：`maps_direction_driving`
- 骑行：`maps_bicycling`
- 公交：`maps_direction_transit_integrated`
- 多点距离矩阵：`maps_distance`

每个 `route_segment` 保存 provider、mode、distance、duration、原始摘要、核验时间和状态。若当前 MCP 返回 geometry，则保存；若只返回文字步骤，不可伪造 geometry，地图可调用 JSAPI 再绘制路线。

旅行者编辑日程时保留未变化地点的 Assignment ID，按有向相邻点对比较前后顺序；只删除断开的 RouteSegment，只计算新增点对，禁止为了单点插入或重排删除当天全部真实道路。

路线失败时使用端点直线作视觉占位，必须标 `fallback_straight_line` 且不写估算耗时。

### 6. 质量复核

运行：

```powershell
python scripts/trip_pipeline.py validate --input trip.json
```

必须检查：

- 所有已排程地点都有真实 provider ID 和 GCJ-02 坐标，或明确标为待核验。
- 同一 POI 不因别名重复。
- 营业时间与目的地时区一致，并带 `verified_at`。
- 每段路线的起终点与日程顺序一致。
- 没有把飞机/火车段画成地面驾车路线。
- 每日总停留与交通时间没有超出时间窗。

### 7. 生成卡片与地图

先渲染无需密钥即可查看的卡片包：

```powershell
python scripts/render_trip.py --input trip.json --output output
```

输出至少包含：

- `index.html`：卡片主界面 + 路线示意 + 数据状态。
- `trip.geojson`：地图/其他 GIS 工具可复用数据。
- `summary.md`：可阅读、可进入 Obsidian 的旅行文档。

如果已配置高德 JSAPI Key 和生产代理，再启用完整交互地图；具体按 `references/card-map-design.md`。如需 PNG 便携卡片，调用 `ljg-card`，输入必须来自同一份 `trip.json`/`summary.md`。

### 8. 交付报告

报告中明确分开：

- 已研究：有来源的文化与实用信息。
- 已核验：高德真实 POI 与核验时间。
- 已计算：高德真实路线与交通方式。
- 待确认：歧义 POI、预约、临时闭馆、无 Key 导致的未核验项。
- 产物路径：`trip.json`、卡片、地图、Markdown、GeoJSON。

## 地图默认方案

用户尚未决定地图形态时，默认选择“卡片优先、地图独立”：

- 桌面端：左侧 Day 卡、中间地图、右侧候选 POI 池。
- 移动端：顶部“卡片 / 地图”切换，地图底部为可拖动卡片抽屉。
- 静态导出：每张 Day 卡包含当天路线缩略图和“在高德打开”入口。
- 双向联动：点卡片定位 Marker；点 Marker 打开并高亮对应卡片。

不要把完整交互地图压进一张 PNG；PNG 只承载摘要和缩略图。

## 降级与停止条件

- 无高德 Key：交付 `candidate` 数据和运行骨架，不能声称真实 POI 已接入。
- MCP 不可用但有 Web Service Key：可用 `scripts/amap_rest.py` 做批量 POI/路径查询，结果仍写入同一契约。
- REST 与 MCP 都不可用：只完成研究与 `needs_verification` 骨架。
- 信息源冲突：保留冲突和日期，优先官方场馆与高德实时结果。
- 路线或开放时间将导致不可执行：必须调整日程或提示用户选择，不静默忽略。

## 维护

- 每季度核对高德 MCP 包、工具名、POI/路径 API 和 JSAPI 安全策略。
- 所有外部响应经适配层归一化，业务层不得依赖供应商原始字段。
- 新 provider 通过相同 `PlaceProvider` / `RouteProvider` 契约接入。
- 将平台运行按 `brief -> researching -> shortlisted -> verifying -> scheduled -> routing -> published` 持久化；重跑从最近完成阶段继续，不能无条件重新消耗供应商额度。
- 让一个或多个同构 Research Worker 服务共享 PlanningRun 队列；Skill 负责研究和阶段契约，用户配额、身份与分享权限由网站后端和数据库强制。
- 发现失败案例时，先补 fixture 和校验规则，再修改提示词。
- TREK 仅作为架构参照；不要复制其 AGPL-3.0 代码进入本 Skill。
