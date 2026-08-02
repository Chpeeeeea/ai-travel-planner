# Platform product architecture

当任务涉及“做成平台”、批量生成不同目的地、控制地图调用量或持久化运行记录时读取本文件。

## 产品对象

```text
PlanningRun
  ├─ Brief
  ├─ ResearchLaneJob[]
  ├─ ResearchEvidence[]
  ├─ Candidate[]
  ├─ ProviderMatch[]
  ├─ ProviderUsageEvent[]
  ├─ ItineraryDay[]
  ├─ RouteSegment[]
  └─ TripShareLink[]
```

- `PlanningRun`：一次可恢复、可审计的生成任务，记录当前阶段、调用量、错误和产物版本。
- 平台面向多用户时，`PlanningRun` 必须绑定稳定的服务端用户 ID；查询和动态结果必须再次校验归属，不能仅靠前端隐藏。
- `Brief`：目的地、天数、兴趣、特别想吃 `must_eat`、必去地点 `must_visit`、节奏、时间窗、交通与硬约束。
- `ResearchLaneJob`：按用户选择动态创建的主题研究线持久化状态；历史、文化、风景、美食只是默认项。平台从人文与城市、自然与户外、吃喝与生活、兴趣与娱乐、旅行方式五类 38 项主题中选择，目录外自定义兴趣也可成为独立研究线。每条线记录尝试次数、证据数、Markdown、错误和完成时间。
- `ResearchEvidence`：一条来源对一个地点名称的支持，只保存研究事实、意见与来源。
- `Candidate`：跨来源合并后的名称级候选；进入供应商核验前不得拥有高德 ID。
- `ProviderMatch`：候选与高德实体的匹配结果，可为已核验、歧义或拒绝。
- `ItineraryDay`：只引用已核验地点，每天默认 4–6 个。
- `RouteSegment`：只连接同一天相邻 Assignment，不能覆盖整个候选池。
- `ProviderUsageEvent`：按用户、运行、类型和时间记录真实供应商调用，是月度配额事实源。
- `TripShareLink`：只保存随机 Token 的摘要、有效期与撤销状态；原始 Token 只在创建时返回。

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

Worker 领取运行时使用 60–900 秒短期租约，数据库只保存租约 Token 的摘要。Worker 在租约一半时间前发送心跳；崩溃或失联后租约过期，其他实例通过比较更新重新领取。单研究线默认最多重试 3 次，单运行最多领取 5 次，避免坏数据或缺失服务造成无限循环。

供应商阶段按小批次运行：POI 和 Route 每批默认最多 5 个。已完成对象不重新请求；配额、频率或密钥错误立即停止本批，保留剩余对象供稍后重试。

`awaiting_quota` 是运行状态而不是第八个业务阶段。服务端额度耗尽时 Worker 释放租约并保持当前阶段；进入下一个 UTC 月后同一个共享队列可以自动重新领取。额度暂停不得增加失败次数或触发研究 Agent 重跑。

## 服务边界

| 服务 | 输入 | 输出 | 禁止事项 |
|---|---|---|---|
| Research Orchestrator | Brief | ResearchEvidence | 不调用高德，不写坐标结论 |
| Candidate Compiler | Evidence | 20–40 Candidates | 不为数量凑地点 |
| Place Verifier | Candidates | ProviderMatch | 不查询清单外地点，不算路线 |
| Itinerary Planner | Verified places | Days/Assignments | 不排入歧义或未核验地点 |
| Route Service | Adjacent assignments | RouteSegments | 不为候选池做全量矩阵 |
| Renderer | trip.json | Cards/Map/Exports | 不生成新的业务事实 |

## 旅行者与执行器边界

- 公开落地页可以展示产品与案例，但创建任务、任务历史和动态结果应进入登录区域。
- 目的地图片用于公开案例卡和已发布行程的氛围表达；新建任务与运行进度保持高密度操作布局。图片不得冒充 POI、开放状态、坐标或路线证据，移动端不得因缩略图挤压主要操作。
- 浏览器只调用身份范围内的旅行者 API；不得获得执行器令牌、高德 Web Service Key 或可代替所有用户写入的凭据。
- Research Worker 使用独立服务器凭据和短期租约领取待处理 Brief、写入真实研究证据并推进阶段；任务尚未被 Worker 接管时保持 `brief`，界面明确显示等待状态。
- 一个 Research Worker 可以依次服务所有用户，且只在当前任务内部并行派发主题 Agent；扩容时增加同构 Worker，由租约避免重复领取。不要按用户复制 Skill，也不要为配额另建 Skill。
- 动态研究 Agent 只获得 Brief、一个用户所选主题和输出 Schema；不继承平台令牌或高德密钥。单次最多选择 8 个主题、默认并发上限 4；主 Worker 等全部必需研究线成功后，才可编译一次候选池。
- 用户 API 必须按 `owner_user_id` 查询；受信执行器 API 继续按运行 ID 工作，但仅在服务器侧开放。
- POI 消歧必须列出供应商名称、行政区、地址、类型、置信度与地图查看入口；旅行者只能处理自己任务中处于 `needs_confirmation` 的候选。确认与排除均不得增加供应商调用，最后一个歧义处理完后把运行恢复为 `verifying/queued`。
- 进度页轮询持久化状态和事件，不暴露内部 Agent 对话；刷新页面后必须能从同一 PlanningRun 恢复。
- 用户任务数和月度 POI/路线额度必须由服务端按稳定用户 ID 统计与拒绝；Prompt、前端按钮和 Agent 自觉都不能作为计费边界。
- 取消任务是网站生命周期终态：清除租约，拒绝后续研究、核验、排程与路线写入；已发出的供应商小批次可记入实际用量，但不得恢复运行状态。归档只影响列表可见性，不能删除证据、事件或用量。
- 公开分享只允许已发布 Trip，且只读呈现卡片和地图。分享页面不得包含编辑、私人导出、任务历史或用户身份；过期或撤销后立即失效，并使用 `noindex`、`no-referrer`。

## 调用预算

- 研究：高德 0 次。
- POI 核验：最多等于 shortlist 数量；默认 20–40 次文本搜索，详情仅用于可能匹配。
- 日程：本地算法，不调用高德路线；可用已核验坐标做粗聚类。
- 路线：每天 N 个地点产生 N−1 个相邻请求。用户改变顺序、插入或移除地点时，服务端必须保留未变化地点的 Assignment ID，比较编辑前后的有向相邻点对，只删除断开的 RouteSegment、保留未变化道路，再把新增点对放回路线队列；不得删除当天全部道路，也不得只在浏览器内临时改图。
- JSAPI：呈现与用户交互，不承担候选发现。
- 多用户平台：把每次真实 POI/Route 调用写入逐用户用量流水；批次大小不得超过该用户剩余额度。

## 平台页面

1. 新建旅行：Brief 表单、来源范围、“特别想吃”和“必去地点”；多个自定义项分别记录，不能压成一段备注。
2. 研究进度：按主题显示来源覆盖与候选数量，不暴露内部 Agent 对话。
3. 候选审阅：合并别名、来源、得分、风险与“是否送高德核验”。
4. POI 消歧：同名或跨城结果并列展示行政区、地址、类型和置信度；用户确认一个真实实体或排除整项，系统自动恢复排程队列。
5. 行程工作台：卡片、地图和候选池联动，允许锁定、插入、移除与重排；动态写入必须再次校验 `owner_user_id`、同源请求和已核验坐标。
6. 发布：身份隔离的动态结果页读取统一 Trip；生成可分享 H5、带 UTF-8 BOM 的 Markdown、只含真实点线几何的 GeoJSON 和导航入口。
7. 分享管理：所有者创建有期限的只读链接并可撤销；数据库不保存原始分享 Token。

Candidate Compiler 只能对 ResearchEvidence 中已存在的候选执行用户约束：`must_visit` 作为强优先级，`must_eat` 作为内容匹配加分。任何用户输入都不能直接写入高德 ID 或坐标。

青田案例只验证上述流程的一次运行。新增城市时创建新的 Brief、证据和案例目录，不复制页面逻辑。
