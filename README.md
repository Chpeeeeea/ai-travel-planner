# AI Travel Planner

AI Travel Planner 是“研究优先、地图收口”的旅行规划平台。青田三日是仓库中的第一条真实目的地案例，不是产品本身。

## 产品流程

```text
官方文旅 / 小红书 / OSM / 历史·文化·风景·美食研究
  -> 生成名称级候选池，不调用高德
  -> 别名合并、去重与评分，缩小到 20–40 个
  -> 高德只核验最终候选的名称、实体与 GCJ-02 位置
  -> AI 每天选择 4–6 个地点并做区域编排
  -> 只为同一天相邻行程点计算真实道路
  -> 同一份行程数据驱动卡片、高德 JSAPI 和导出
```

这条边界控制三类风险：研究阶段不会把“听说过的名称”伪装成真实 POI；候选池不会产生路线调用；地图费用集中在最终能进入行程的少量地点。

## 当前实现

- `/`：平台产品入口，可生成目的地研究 Brief，并预估候选核验与路线调用量。
- `/cases/qingtian`：青田三日交互案例，包含卡片、候选地点、高德道路与遥感图层。
- `platform/pipeline.py`：可执行的离线管线，负责候选合并评分、高德核验清单、每日编排和相邻路线清单。
- D1 `PlanningRun`：保存 Brief、研究证据、候选、高德匹配、日程、路线、阶段事件和供应商调用计数。
- `/api/planning-runs`：受服务端令牌保护的任务创建、查询和阶段推进接口；不向公开页面暴露写入凭据。
- `cases/qingtian/trip.json`：青田案例的最终行程事实源。
- `skill/ai-travel-planner`：与产品管线一致的 Codex Skill 源码。

## 高德调用策略

- 研究和候选生成：0 次高德调用。
- POI：只对排名后的 20–40 个候选执行文本搜索与详情核验。
- 路线：若一天安排 N 个地点，只请求 N−1 段相邻道路。
- JSAPI：只负责已生成行程的呈现、图层切换和交互重排。

## 青田案例

- 3 天，美食为主线，同时覆盖历史、文化和风景。
- 21 个已核验高德 POI，1 个地点仍待消歧。
- 15 段已核验相邻路线。
- 支持候选点插入、地点说明、地图点位双击放大、首次进入自动聚焦研究区、研究区复位以及道路/遥感图层切换。

公开产品与案例：[https://qingtian-ai-travel.amandeepchenisekyana.chatgpt.site](https://qingtian-ai-travel.amandeepchenisekyana.chatgpt.site)

## 本地运行与验证

```bash
npm install
npm run dev
npm test
```

阶段更新和发布要求见 `AGENTS.md`，管线文件格式与命令见 `platform/README.md`。
