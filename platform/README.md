# Platform pipeline

这里维护可复用的平台管线，青田只是它的一条案例数据。

```text
Brief + official / Xiaohongshu / OSM / topic research evidence
  -> compile: name-level candidate pool (no AMap)
  -> prepare-amap: 20–40 final POI verification queries
  -> schedule: 4–6 verified places per day
  -> adjacent-only route manifest
  -> cards and AMap JSAPI
```

三个阶段使用不同文件，避免研究候选被误写成已核验地点：

- `research-evidence.json`：来源证据与地点名称，不含高德实体数据。
- `candidate-pool.json`：去重、评分后的 20–40 个候选。
- `verified-candidates.json`：高德匹配完成后的实体地点。
- `itinerary.json`：每日安排与仅相邻点组成的路线请求。

运行方式：

```powershell
python platform/pipeline.py compile --brief brief.json --evidence research-evidence.json --output candidate-pool.json
python platform/pipeline.py prepare-amap --input candidate-pool.json --output amap-manifest.json
python platform/pipeline.py schedule --brief brief.json --verified verified-candidates.json --output itinerary.json
python platform/pipeline.py audit --input itinerary.json
```

高德调用由 provider adapter 或 Skill 的 MCP bridge 执行；本脚本不读取密钥，也不会在研究阶段调用高德。

## 平台服务

旅行者入口与受信执行器分层：

- `/studio` 与 `/api/trips` 使用 ChatGPT 登录身份，只能创建和查看当前用户拥有的 PlanningRun。
- `planning_runs.owner_user_id` 是用户任务归属的事实源；公开页面不持有服务令牌。
- `/api/planning-runs/**` 继续供 Research Worker 与后续阶段执行器使用服务器令牌，避免把高德调用能力交给浏览器。
- 新任务在 Research Worker 写入真实来源证据前保持 `brief`，不得自动跳过研究阶段。

服务端使用与离线脚本相同的边界：

1. `POST /api/planning-runs` 创建 Brief；支持 `must_eat` 与 `must_visit` 用户约束。
2. `POST /api/planning-runs/research` 分批写入研究证据；单批最多 100 条，重复来源幂等更新。
3. `POST /api/planning-runs/compile` 统一做别名合并、去重评分并持久化最多 40 个 shortlist。
4. `GET /api/planning-runs/candidates?run_id=...` 获取候选审阅结果。
5. `POST /api/planning-runs/verify` 每批核验最多 5 个 shortlist 候选；`PATCH` 处理同名 POI 的确认或拒绝。
6. `POST /api/planning-runs/schedule` 只从已核验地点生成每天 4–6 个地点。
7. `POST /api/planning-runs/routes` 创建同日相邻 RouteSegment，并每批最多计算 5 段真实道路。
8. `GET /api/planning-runs/trip?run_id=...` 输出卡片与地图共用的旅行事实源。

这些接口都使用服务端令牌保护。研究与候选编译不会读取高德 Key，阶段事件中的 POI/路线调用增量固定为 0。

候选编译只对已有研究证据应用用户约束：名称或别名命中 `must_visit` 时强制优先排序，介绍或现场看点命中 `must_eat` 时增加匹配分；两者仍保持 `candidate` 状态，等待高德核验。

高德调用使用服务端 `AMAP_WEBSERVICE_KEY`，不把 Key 发给浏览器。核验自动确认阈值为 0.80，且第一、第二匹配分差必须至少为 0.15。编排阶段不调用地图服务；路线只查询已落入日程的相邻点，失败结果保持可重试或标为无耗时的端点连线。
