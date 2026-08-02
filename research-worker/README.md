# Research Worker

这个目录是旅行平台的外部执行器。Sites 网站只保存 Brief、D1 状态和结果；Worker 在受信 Agent 环境中领取任务，按用户选择调用 Codex Skill 完成多主题检索，再通过受保护 API 推进候选、高德核验、排程和相邻道路。

## 执行顺序

1. `POST /api/planning-runs/claim` 以原子比较更新领取一个未完成 PlanningRun，并取得短期租约。
2. 根据 Brief 从主题目录创建最多 8 条研究线；默认推荐历史遗迹、文化非遗、自然风景和地方美食，用户也可选择建筑、博物馆、艺术、在地生活、亲子、夜游、购物、户外、摄影、康养、信仰或影视动漫。
3. 以 `RESEARCH_WORKER_CONCURRENCY` 控制有界并发，为每条研究线执行一次独立 `codex exec`。
4. 每个 Codex 进程显式调用 `$ai-travel-planner` 与 `$vibe-web-research`，使用 `lane-output.schema.json` 约束最终 JSON。
5. Worker 将带来源的名称级证据幂等写入 `/research`，并把每条研究线的 Markdown、证据数、重试数和错误写入 D1。
6. 所有已选研究线成功后，主 Worker 串行调用 `/compile`、`/verify`、`/schedule`、`/routes`。
7. Worker 每半个租约周期发送心跳；进程退出后租约会过期，另一实例可以从已完成阶段继续。

研究 Agent 不能调用高德。高德 Web Service Key 只存在 Sites 服务端，Worker 只调用小批量阶段 API。

## 运行要求

- Node.js 22.13+
- 可执行的 Codex CLI；官方支持用 `codex exec`、`--output-schema` 和 `--output-last-message` 构建非交互任务
- 仓库根目录的 `.agents/skills/ai-travel-planner`
- Worker 用户环境中安装并可用的 `vibe-web-research`
- 对应平台的合法登录/连接器；验证码或访问限制只能记录为覆盖不足
- 已在 Sites 配置的 `PLANNING_RUN_WRITE_TOKEN` 与 `AMAP_WEBSERVICE_KEY`

## 环境变量

| 变量 | 用途 | 默认值 |
|---|---|---|
| `PLANNER_BASE_URL` | 已部署平台地址 | 必填 |
| `PLANNING_RUN_WRITE_TOKEN` | 执行器 Bearer Token | 必填 |
| `CODEX_EXECUTABLE` | Codex CLI 可执行文件 | `codex` |
| `RESEARCH_WORKER_ID` | 日志与租约实例名 | 主机名 + PID |
| `RESEARCH_WORKER_LEASE_SECONDS` | 租约长度 | `600`，限制 60–900 |
| `RESEARCH_WORKER_POLL_SECONDS` | 无任务时轮询间隔 | `15` |
| `RESEARCH_WORKER_CONCURRENCY` | 同时运行的 Codex 研究 Agent 数 | `4`，限制 1–4 |
| `RESEARCH_WORKER_MAX_LANE_ATTEMPTS` | 单条研究线最大尝试数 | `3` |

Worker 会在启动 Codex 子进程前移除平台令牌和所有高德密钥，研究 Agent 不会继承这些服务器凭据。如果自动化环境使用 `CODEX_API_KEY`，只向隔离的 Worker 进程提供，并遵循 Codex 非交互模式的密钥隔离要求；不要把密钥设为包含不受信代码步骤的全局 CI 环境变量。

## 启动

PowerShell 示例：

```powershell
$env:PLANNER_BASE_URL = "https://your-site.example"
$env:PLANNING_RUN_WRITE_TOKEN = "<server-token>"
$env:CODEX_EXECUTABLE = "C:\path\to\codex.exe"
npm.cmd run worker:research -- --once
```

持续轮询：

```powershell
npm.cmd run worker:research -- --watch
```

只检查 Codex CLI、平台令牌和受保护 API，不领取任务：

```powershell
npm.cmd run worker:research -- --check
```

只查看聚合运维状态，不启动 Codex、不领取任务：

```powershell
npm.cmd run worker:research -- --status
```

`--status` 返回队列深度、活动与过期租约、运行阶段、研究线状态和当月 POI/路线总调用量。接口不会返回目的地、Brief、用户标识、租约 Token 或任何高德密钥，可用于人工巡检和后续告警。

日志输出为 JSON Lines，不打印租约 Token、平台 Token 或高德密钥。

## 部署边界

Worker 不应与公开网页运行在同一个浏览器进程，也不应把 Codex 认证或平台写入令牌交给前端。可选部署方式包括独立云主机、容器服务或受信的常驻工作站；2 核 2G 建议设置并发 1–2，4G 以上内存再使用默认并发 4。选择 8 个主题不等于同时运行 8 个进程。

公共 Sites Demo 只有在这个进程实际在线且密钥配置完成后，才会自动越过 `brief/researching`。仓库包含完整执行器，但不会伪装成已经部署的后台服务。

## 2 核 2G 阿里云部署

仓库提供 [`worker.env.example`](worker.env.example) 和 [`ai-travel-planner-worker.service`](ai-travel-planner-worker.service)。建议使用 Ubuntu 22.04/24.04、Node.js 22、10 GB 以上可用磁盘，并把并发固定为 `1`；2 GB 内存不适合同时运行 4 个 Codex 研究进程。

部署前需要准备：

1. 一台可通过 SSH 登录的阿里云 ECS；安全组只需开放 SSH，Worker 主动访问 Sites，不需要额外公开端口或域名。
2. Linux 服务用户 `ai-travel`，仓库放在 `/opt/ai-travel-planner`，服务用户能读取仓库和自己的 Codex 配置。
3. Node.js 22、npm 10、Git 和 Codex CLI；在服务用户身份下完成 Codex 登录，或用独立的 `CODEX_API_KEY` 环境文件。
4. 从仓库固定提交使用 `.agents/skills/ai-travel-planner`，并在同一服务用户环境安装 `vibe-web-research`。不要把本机临时 Skill 副本手工粘贴成无版本依赖。
5. 在 `/etc/ai-travel-planner/worker.env` 写入与 Sites 相同的 `PLANNING_RUN_WRITE_TOKEN`，权限设为 root 所有、`0600`；不要把令牌写进仓库、命令历史或 systemd unit。
6. 先运行 `npm run worker:research -- --check`，再用 `--status` 确认队列与租约状态，最后安装并启动 systemd 服务；日志通过 `journalctl -u ai-travel-planner-worker` 查看。

```bash
sudo install -d -o ai-travel -g ai-travel /opt/ai-travel-planner
sudo install -d -m 700 /etc/ai-travel-planner
sudo install -m 600 research-worker/worker.env.example /etc/ai-travel-planner/worker.env
sudo install -m 644 research-worker/ai-travel-planner-worker.service /etc/systemd/system/ai-travel-planner-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now ai-travel-planner-worker
sudo systemctl status ai-travel-planner-worker --no-pager
```

上述命令不会代替仓库克隆、`npm ci`、Codex 登录和密钥填写。完整社交平台检索还需要合法的登录态或 Browser Bridge；纯 headless ECS 默认只能保证官方网页、开放 Web 与 OSM 覆盖，遇到小红书登录或验证码时必须记录为覆盖不足，不能绕过平台限制。

官方参考：[`codex exec` 非交互模式](https://developers.openai.com/codex/noninteractive)、[Codex Skills](https://developers.openai.com/codex/skills)。
