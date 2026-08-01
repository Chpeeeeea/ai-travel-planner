# Platform product architecture

当任务涉及“做成平台”、批量生成不同目的地、控制地图调用量或持久化运行记录时读取本文件。

## 产品对象

```text
PlanningRun
  ├─ Brief
  ├─ ResearchEvidence[]
  ├─ Candidate[]
  ├─ ProviderMatch[]
  ├─ ItineraryDay[]
  └─ RouteSegment[]
```

- `PlanningRun`：一次可恢复、可审计的生成任务，记录当前阶段、调用量、错误和产物版本。
- `Brief`：目的地、天数、兴趣、特别想吃 `must_eat`、必去地点 `must_visit`、节奏、时间窗、交通与硬约束。
- `ResearchEvidence`：一条来源对一个地点名称的支持，只保存研究事实、意见与来源。
- `Candidate`：跨来源合并后的名称级候选；进入供应商核验前不得拥有高德 ID。
- `ProviderMatch`：候选与高德实体的匹配结果，可为已核验、歧义或拒绝。
- `ItineraryDay`：只引用已核验地点，每天默认 4–6 个。
- `RouteSegment`：只连接同一天相邻 Assignment，不能覆盖整个候选池。

## 状态机

```text
brief
  -> researching
  -> shortlisted
  -> verifying
  -> scheduled
  -> routing
  -> published
```

每次转换保存输入哈希、输出位置、开始/完成时间、供应商调用数与失败原因。阶段失败后从该阶段重试，不重新执行已成功研究和核验。

## 服务边界

| 服务 | 输入 | 输出 | 禁止事项 |
|---|---|---|---|
| Research Orchestrator | Brief | ResearchEvidence | 不调用高德，不写坐标结论 |
| Candidate Compiler | Evidence | 20–40 Candidates | 不为数量凑地点 |
| Place Verifier | Candidates | ProviderMatch | 不查询清单外地点，不算路线 |
| Itinerary Planner | Verified places | Days/Assignments | 不排入歧义或未核验地点 |
| Route Service | Adjacent assignments | RouteSegments | 不为候选池做全量矩阵 |
| Renderer | trip.json | Cards/Map/Exports | 不生成新的业务事实 |

## 调用预算

- 研究：高德 0 次。
- POI 核验：最多等于 shortlist 数量；默认 20–40 次文本搜索，详情仅用于可能匹配。
- 日程：本地算法，不调用高德路线；可用已核验坐标做粗聚类。
- 路线：每天 N 个地点产生 N−1 个相邻请求。只有用户改变顺序或插入地点时，重算受影响的前后两段。
- JSAPI：呈现与用户交互，不承担候选发现。

## 平台页面

1. 新建旅行：Brief 表单、来源范围、“特别想吃”和“必去地点”；多个自定义项分别记录，不能压成一段备注。
2. 研究进度：按主题显示来源覆盖与候选数量，不暴露内部 Agent 对话。
3. 候选审阅：合并别名、来源、得分、风险与“是否送高德核验”。
4. POI 消歧：同名结果并列，低于阈值必须人工确认。
5. 行程工作台：卡片、地图和候选池联动，允许锁定、插入与重排。
6. 发布：生成可分享 H5、Markdown、GeoJSON 和导航入口。

Candidate Compiler 只能对 ResearchEvidence 中已存在的候选执行用户约束：`must_visit` 作为强优先级，`must_eat` 作为内容匹配加分。任何用户输入都不能直接写入高德 ID 或坐标。

青田案例只验证上述流程的一次运行。新增城市时创建新的 Brief、证据和案例目录，不复制页面逻辑。
