"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MAX_SELECTED_TRAVEL_TOPICS, TRAVEL_TOPICS } from "../../platform/runtime/travel-topics.mjs";
import styles from "./studio.module.css";
import reviewStyles from "./review.module.css";

const stages = [
  ["brief", "旅行需求", "保存目的地、天数和硬约束"],
  ["researching", "多源研究", "官方文旅、小红书、OSM 与用户所选主题线"],
  ["shortlisted", "候选编译", "别名合并、去重评分，缩到 20–40 个"],
  ["verifying", "位置核验", "高德只确认最终候选的名称与坐标"],
  ["scheduled", "每日编排", "从已核验地点中选择每天 4–6 个"],
  ["routing", "真实道路", "仅计算同一天相邻地点的路线"],
  ["published", "卡片地图", "同一份行程驱动卡片、地图与导出"],
] as const;

const stageIndex = new Map(stages.map((stage, index) => [stage[0], index]));
const themeCatalog = TRAVEL_TOPICS as ReadonlyArray<{ id: string; label: string; scope: string }>;
const laneLabels: Record<string, string> = Object.fromEntries(themeCatalog.map((theme) => [theme.id, theme.label]));
const laneStatusLabels: Record<string, string> = { queued: "等待", running: "检索中", succeeded: "完成", failed: "待重试" };

type BriefDraft = { destination: string; days: number; interests: string[]; mustEat: string[]; mustVisit: string[] };
type RunSummary = {
  id: string; destination: string; days: number; status: string; current_stage: string; stage_index: number;
  provider_poi_calls: number; provider_route_calls: number; last_error: string | null; created_at: string; updated_at: string;
};
type Snapshot = {
  run: RunSummary;
  brief: { interests?: string[]; must_eat?: string[]; must_visit?: string[] } | null;
  progress: {
    evidence_total: number; evidence_by_lane: Record<string, number>; shortlisted: number; verified: number;
    needs_confirmation: number; scheduled_days: number; scheduled_places: number; route_segments: number; verified_routes: number;
    research_lanes: Array<{ lane: string; topic_label: string; status: string; attempt_count: number; evidence_count: number; last_error: string | null }>;
  };
  worker: { attempt: number; active: boolean; version: string | null; lease_expires_at: string | null };
  events: Array<{ id: string; to_stage: string; status: string; message: string; poi_calls: number; route_calls: number; created_at: string }>;
  policy: { research_provider_calls: number; shortlist_range: number[]; daily_stops_range: number[]; route_rule: string };
};

function joinNeeds(values: string[]) { return values.join("、"); }
function splitNeeds(value: string) { return [...new Set(value.split(/[，,、\n]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 12); }
function dateText(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

function nextStatement(stage: string) {
  if (stage === "brief") return "接下来：Research Worker 读取 Brief，按你选择的主题并行检索官方文旅、小红书、OSM 与开放 Web。此阶段高德调用必须为 0。";
  if (stage === "researching") return "接下来：把多条研究证据编译成名称级候选池，合并别名并缩小到 20–40 个。";
  if (stage === "shortlisted") return "接下来：高德只核验最终候选；同名或跨城结果会进入人工确认。";
  if (stage === "verifying") return "接下来：只使用已核验 POI，每天选择 4–6 个并完成区域聚类和顺序优化。";
  if (stage === "scheduled") return "接下来：只为同一天相邻地点请求真实道路，不计算候选池路线矩阵。";
  if (stage === "routing") return "接下来：道路完成后发布统一行程，卡片与地图由同一份数据驱动。";
  return "行程已经发布，可以进入卡片地图继续查看和调整。";
}

export default function TravelStudio({ user, initialBrief, initialRunId }: {
  user: { displayName: string; email: string };
  initialBrief: BriefDraft;
  initialRunId: string;
}) {
  const [draft, setDraft] = useState(initialBrief);
  const [mustEatText, setMustEatText] = useState(joinNeeds(initialBrief.mustEat));
  const [mustVisitText, setMustVisitText] = useState(joinNeeds(initialBrief.mustVisit));
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState(initialRunId);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const currentIndex = snapshot ? (stageIndex.get(snapshot.run.current_stage as typeof stages[number][0]) ?? 0) : 0;
  const estimates = useMemo(() => ({ shortlist: Math.min(40, Math.max(20, draft.days * 10)), routes: draft.days * 4 }), [draft.days]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/trips").then(async (response) => {
      if (!response.ok) throw new Error("无法读取旅行任务");
      const data = await response.json() as { runs?: RunSummary[]; error?: string };
      if (!cancelled) setRuns(data.runs ?? []);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "无法读取旅行任务"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    async function poll() {
      controller = new AbortController();
      try {
        const response = await fetch(`/api/trips?run_id=${encodeURIComponent(activeRunId)}`, { signal: controller.signal });
        const data = await response.json() as Snapshot & { error?: string };
        if (!response.ok) throw new Error(data.error || "无法读取任务进度");
        if (cancelled) return;
        setSnapshot(data);
        setError("");
        setRuns((current) => [data.run, ...current.filter((item) => item.id !== data.run.id)]);
        if (data.run.current_stage !== "published" && data.run.status !== "failed") timer = setTimeout(poll, 5000);
      } catch (reason) {
        if (cancelled || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setError(reason instanceof Error ? reason.message : "无法读取任务进度");
        timer = setTimeout(poll, 8000);
      }
    }
    poll();
    return () => { cancelled = true; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [activeRunId]);

  async function createRun(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destination: draft.destination,
          days: draft.days,
          interests: draft.interests,
          must_eat: splitNeeds(mustEatText),
          must_visit: splitNeeds(mustVisitText),
          pace: "moderate",
          transport_mode: "mixed",
          daily_window: { start: "09:00", end: "18:00" },
          source_policy: ["official", "xiaohongshu", "osm", "multi_topic_research"],
          candidate_target: { min: 20, max: 40 },
          daily_stops: { min: 4, max: 6 },
        }),
      });
      const data = await response.json() as { run: { id: string }; error?: string };
      if (!response.ok) throw new Error(data.error || "创建任务失败");
      setSnapshot(null);
      setActiveRunId(data.run.id);
      window.history.replaceState({}, "", `/studio?run_id=${encodeURIComponent(data.run.id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建任务失败");
    } finally {
      setCreating(false);
    }
  }

  function chooseRun(run: RunSummary) {
    setSnapshot(null);
    setActiveRunId(run.id);
    window.history.replaceState({}, "", `/studio?run_id=${encodeURIComponent(run.id)}`);
  }

  function toggleTheme(theme: string) {
    setDraft((current) => ({
      ...current,
      interests: current.interests.includes(theme)
        ? current.interests.filter((item) => item !== theme)
        : current.interests.length < MAX_SELECTED_TRAVEL_TOPICS ? [...current.interests, theme] : current.interests,
    }));
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}><span>行</span><b>AI Travel Planner</b></Link>
        <div><span>{user.displayName}</span><Link href="/signout-with-chatgpt?return_to=%2F">退出</Link></div>
      </header>
      <section className={styles.hero}>
        <div><p>TRAVEL RESEARCH STUDIO</p><h1>把一次旅行，做成可恢复的研究任务。</h1><span>青田只是案例。这里创建的每个目的地都有独立 Brief、证据、候选池、POI 核验和真实道路记录。</span></div>
        <dl><div><dt>研究阶段</dt><dd>高德 0 次</dd></div><div><dt>最终候选</dt><dd>20–40 个</dd></div><div><dt>每日地点</dt><dd>4–6 个</dd></div></dl>
      </section>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sectionTitle}><span>我的任务</span><b>{runs.length}</b></div>
          <button className={!activeRunId ? styles.activeRun : ""} onClick={() => { setSnapshot(null); setActiveRunId(""); window.history.replaceState({}, "", "/studio"); }}>＋ 新建旅行</button>
          <div className={styles.runList}>{runs.map((run) => <button key={run.id} className={run.id === activeRunId ? styles.activeRun : ""} onClick={() => chooseRun(run)}><strong>{run.destination} · {run.days} 天</strong><span>{stages[stageIndex.get(run.current_stage as typeof stages[number][0]) ?? 0][1]} · {dateText(run.updated_at)}</span></button>)}</div>
        </aside>

        {!activeRunId ? (
          <section className={styles.createPanel}>
            <header><p>NEW PLANNING RUN</p><h2>新建旅行研究</h2><span>提交后先建立任务记录，不会立刻用高德全城搜索。</span></header>
            <form onSubmit={createRun}>
              <div className={styles.formGrid}><label>目的地<input required value={draft.destination} onChange={(event) => setDraft({ ...draft, destination: event.target.value })} /></label><label>旅行天数<select value={draft.days} onChange={(event) => setDraft({ ...draft, days: Number(event.target.value) })}>{[1,2,3,4,5,6,7].map((day) => <option key={day} value={day}>{day} 天</option>)}</select></label></div>
              <fieldset><legend>研究主题 · 已选 {draft.interests.length}/{MAX_SELECTED_TRAVEL_TOPICS}</legend><div className={styles.themeGrid}>{themeCatalog.map((theme) => <button type="button" key={theme.id} title={theme.scope} className={draft.interests.includes(theme.label) ? styles.selectedTheme : ""} onClick={() => toggleTheme(theme.label)}>{theme.label}</button>)}</div></fieldset>
              <div className={styles.formGrid}><label>特别想吃<input value={mustEatText} onChange={(event) => setMustEatText(event.target.value)} placeholder="菜品或店铺，用逗号分隔" /></label><label>必去地点<input value={mustVisitText} onChange={(event) => setMustVisitText(event.target.value)} placeholder="景点或区域，用逗号分隔" /></label></div>
              <div className={styles.preview}><span>预计核验不超过 <b>{estimates.shortlist}</b> 个最终候选</span><span>预计计算约 <b>{estimates.routes}</b> 段相邻道路</span></div>
              <button className={styles.primary} disabled={creating}>{creating ? "正在建立任务…" : "创建 PlanningRun"}</button>
              {error && <p className={styles.error} role="alert">{error}</p>}
            </form>
          </section>
        ) : snapshot ? (
          <section className={styles.progressPanel}>
            <header className={styles.runHeader}><div><p>PLANNING RUN</p><h2>{snapshot.run.destination} · {snapshot.run.days} 天</h2><span>任务 {snapshot.run.id.slice(0, 8)} · {dateText(snapshot.run.updated_at)} 更新</span></div><div><b>{snapshot.progress.evidence_total}</b><span>研究证据</span><b>{snapshot.run.provider_poi_calls}</b><span>POI 调用</span><b>{snapshot.run.provider_route_calls}</b><span>路线调用</span></div></header>
            <ol className={styles.stageList}>{stages.map(([id, title, copy], index) => { const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "waiting"; return <li key={id} data-state={state}><i>{state === "done" ? "✓" : String(index + 1).padStart(2,"0")}</i><div><strong>{title}</strong><span>{copy}</span></div><em>{state === "done" ? "完成" : state === "active" ? "当前" : "等待"}</em></li>; })}</ol>
            <div className={styles.nextStep}><span>下一步声明</span><p>{nextStatement(snapshot.run.current_stage)}</p>{snapshot.run.current_stage === "brief" && <small>任务已进入持久化队列，等待 Research Worker 领取；没有真实证据前不会伪造候选或地图结果。</small>}{snapshot.worker.active && <small>Research Worker 正在执行第 {snapshot.worker.attempt} 次尝试，租约到期前会持续发送心跳。</small>}</div>
            <div className={styles.metrics}>
              <article><span>已选主题研究线</span><div>{(snapshot.progress.research_lanes.length ? snapshot.progress.research_lanes : Object.entries(snapshot.progress.evidence_by_lane).map(([lane, count]) => ({ lane, topic_label: laneLabels[lane] ?? lane, status: count ? "running" : "queued", attempt_count: 0, evidence_count: count, last_error: null }))).map((job) => <p key={job.lane} title={job.last_error ?? ""}><b>{job.topic_label || laneLabels[job.lane] || job.lane} · {laneStatusLabels[job.status] ?? job.status}</b><i>{job.evidence_count}</i></p>)}</div></article>
              <article><span>候选与核验</span><p><b>最终候选</b><i>{snapshot.progress.shortlisted}</i></p><p><b>已核验</b><i>{snapshot.progress.verified}</i></p><p><b>待消歧</b><i>{snapshot.progress.needs_confirmation}</i></p></article>
              <article><span>行程与道路</span><p><b>已排天数</b><i>{snapshot.progress.scheduled_days}</i></p><p><b>已选地点</b><i>{snapshot.progress.scheduled_places}</i></p><p><b>真实道路</b><i>{snapshot.progress.verified_routes}/{snapshot.progress.route_segments}</i></p></article>
            </div>
            {snapshot.progress.needs_confirmation > 0 && <div className={reviewStyles.callout}><div><strong>{snapshot.progress.needs_confirmation} 个地点需要你确认</strong><span>同名或跨城结果不会自动进入日程；核对行政区和地址后，任务会继续排程。</span></div><Link href={`/disambiguation?run_id=${encodeURIComponent(snapshot.run.id)}`}>确认地点 →</Link></div>}
            <section className={styles.events}><h3>运行记录</h3>{snapshot.events.map((event) => <article key={event.id}><i /><div><strong>{event.message}</strong><span>{dateText(event.created_at)} · POI {event.poi_calls} / Route {event.route_calls}</span></div></article>)}</section>
            {snapshot.run.current_stage === "published" && <div className="studio-result-actions"><Link className={styles.resultLink} href={`/trip?run_id=${encodeURIComponent(snapshot.run.id)}`}>打开卡片地图 →</Link><a href={`/api/trips/trip?run_id=${encodeURIComponent(snapshot.run.id)}`}>查看技术数据</a></div>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </section>
        ) : <section className={styles.loading} aria-live="polite">正在读取任务进度…</section>}
      </div>
    </main>
  );
}
