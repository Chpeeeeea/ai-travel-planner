"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DEFAULT_TRAVEL_TOPIC_IDS, MAX_SELECTED_TRAVEL_TOPICS, TRAVEL_TOPICS } from "../platform/runtime/travel-topics.mjs";
import styles from "./platform.module.css";

const themeCatalog = TRAVEL_TOPICS as ReadonlyArray<{ id: string; label: string; scope: string }>;
const defaultThemes = themeCatalog.filter((theme) => DEFAULT_TRAVEL_TOPIC_IDS.includes(theme.id)).map((theme) => theme.label);
const sources = [
  ["官方文旅", "确认事实、开放规则和目的地脉络"],
  ["小红书", "发现真实体验、店铺和现场摩擦"],
  ["OSM", "补充名称、区域与开放地理线索"],
  ["多主题研究", "按用户选择动态派发专题研究 Agent"],
];
const stages = [
  ["01", "旅行 Brief", "目的地、天数、偏好和节奏"],
  ["02", "多源发现", "只收集名称和证据，不调用地图服务"],
  ["03", "候选池", "别名合并、去重评分，保留 20–40 个"],
  ["04", "位置核验", "仅把最终候选交给高德确认实体与坐标"],
  ["05", "每日编排", "AI 每天选择 4–6 个地点并控制节奏"],
  ["06", "真实道路", "只计算当天相邻行程点之间的路线"],
  ["07", "卡片地图", "用同一份行程驱动介绍、地图和调整"],
];

function parseCustomNeeds(value: string) {
  return [...new Set(value.split(/[，,；;\n]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
}

export default function PlatformHome() {
  const [destination, setDestination] = useState("青田县");
  const [days, setDays] = useState(3);
  const [selectedThemes, setSelectedThemes] = useState(defaultThemes);
  const [mustEat, setMustEat] = useState("");
  const [mustVisit, setMustVisit] = useState("");
  const estimates = useMemo(() => {
    const dailyStops = 5;
    return {
      discovery: Math.max(60, days * 30),
      shortlist: Math.min(40, Math.max(20, days * 10)),
      selected: days * dailyStops,
      routes: days * (dailyStops - 1),
    };
  }, [days]);

  function toggleTheme(theme: string) {
    setSelectedThemes((current) => current.includes(theme)
      ? current.filter((item) => item !== theme)
      : current.length < MAX_SELECTED_TRAVEL_TOPICS ? [...current, theme] : current);
  }

  function openStudio() {
    const params = new URLSearchParams({
      destination,
      days: String(days),
      interests: selectedThemes.join(","),
      must_eat: parseCustomNeeds(mustEat).join(","),
      must_visit: parseCustomNeeds(mustVisit).join(","),
    });
    window.location.assign(`/studio?${params.toString()}`);
  }

  function downloadBrief() {
    const brief = {
      destination,
      days,
      interests: selectedThemes,
      must_eat: parseCustomNeeds(mustEat),
      must_visit: parseCustomNeeds(mustVisit),
      pace: "moderate",
      transport_mode: "mixed",
      daily_window: { start: "09:00", end: "18:00" },
      source_policy: ["official", "xiaohongshu", "osm", "multi_topic_research"],
      candidate_target: { min: 20, max: 40 },
      daily_stops: { min: 4, max: 6 },
      provider_policy: "AMap only verifies shortlisted POIs and adjacent itinerary routes",
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(brief, null, 2)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${destination || "destination"}-travel-brief.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}><span>行</span><b>AI Travel Planner</b></Link>
        <div><Link href="#flow">工作方式</Link><Link href="/cases/qingtian">青田案例</Link><Link href="/case-study">产品作品集</Link></div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>RESEARCH FIRST · ROUTE LAST</p>
          <h1>先把一座城市研究明白，<br />再排成真正走得通的旅行。</h1>
          <p>官方资料负责事实，旅行平台负责发现，地图只核验最终地点和真实道路。更少的地图调用，也更少“看起来合理”的错误推荐。</p>
          <div className={styles.heroProof}>
            <span><b>20–40</b> 个最终核验候选</span>
            <span><b>4–6</b> 个每日地点</span>
            <span><b>N−1</b> 段真实路线</span>
          </div>
        </div>

        <form className={styles.briefCard} onSubmit={(event) => { event.preventDefault(); openStudio(); }}>
          <div className={styles.cardTop}><span>新建旅行研究</span><i>Brief 01</i></div>
          <label>目的地<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="输入城市或区域" required /></label>
          <label>旅行天数<select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value} 天</option>)}
          </select></label>
          <fieldset><legend>兴趣重点 <span>已选 {selectedThemes.length}/{MAX_SELECTED_TRAVEL_TOPICS}</span></legend><div className={styles.themeGrid}>{themeCatalog.map((theme) => <button type="button" key={theme.id} title={theme.scope} className={selectedThemes.includes(theme.label) ? styles.selected : ""} onClick={() => toggleTheme(theme.label)} aria-pressed={selectedThemes.includes(theme.label)}>{theme.label}</button>)}</div></fieldset>
          <fieldset className={styles.customNeeds}>
            <legend>这次旅行最在意什么 <span>可选，多个内容用逗号分隔</span></legend>
            <div className={styles.customNeedGrid}>
              <label>特别想吃<input value={mustEat} onChange={(event) => setMustEat(event.target.value)} placeholder="例如：锅包肉、鸡架、老四季抻面" /></label>
              <label>必去地点<input value={mustVisit} onChange={(event) => setMustVisit(event.target.value)} placeholder="例如：沈阳故宫、中街" /></label>
            </div>
            <p>研究会优先寻找相关证据；必去地点仍需通过真实位置和开放状态核验。</p>
          </fieldset>
          <button className={styles.primary} type="submit">进入旅行研究工作台</button>
          <div className={styles.estimate} aria-label="任务调用量预估">
            <p><strong>{destination} · {days} 天</strong><span>{selectedThemes.join(" / ") || "城市代表性体验"}</span></p>
            {(parseCustomNeeds(mustEat).length > 0 || parseCustomNeeds(mustVisit).length > 0) && <p className={styles.needSummary}>
              {parseCustomNeeds(mustEat).length > 0 && <span><b>特别想吃</b>{parseCustomNeeds(mustEat).join("、")}</span>}
              {parseCustomNeeds(mustVisit).length > 0 && <span><b>必去</b>{parseCustomNeeds(mustVisit).join("、")}</span>}
            </p>}
            <div><span>发现约 {estimates.discovery} 个名称</span><span>高德核验 {estimates.shortlist} 个</span><span>路线约 {estimates.routes} 段</span></div>
            <button type="button" onClick={downloadBrief}>下载研究 Brief</button>
          </div>
        </form>
      </section>

      <section className={styles.sourceBand} aria-label="研究来源">
        {sources.map(([title, copy], index) => <article key={title}><span>0{index + 1}</span><div><h2>{title}</h2><p>{copy}</p></div></article>)}
      </section>

      <section id="flow" className={styles.flowSection}>
        <header><p className={styles.kicker}>ONE CONTROLLED FLOW</p><h2>地图不是搜索引擎，而是最后的核验与执行层。</h2><p>平台把每一步的输入、结果和调用量分开记录。研究候选不会冒充真实 POI，未进入日程的地点也不会产生路线费用。</p></header>
        <div className={styles.flowGrid}>{stages.map(([number, title, copy], index) => <article key={number} className={index === 3 || index === 5 ? styles.liveStage : ""}><span>{number}</span><h3>{title}</h3><p>{copy}</p>{index < stages.length - 1 && <i>→</i>}</article>)}</div>
      </section>

      <section className={styles.economy}>
        <div><p className={styles.kicker}>CONTROL THE EXPENSIVE PART</p><h2>把高德调用从“全网发现”缩到两个确定动作。</h2></div>
        <div className={styles.economyCards}>
          <article><span>POI 核验</span><strong>20–40 次</strong><p>只查询去重评分后的最终候选，不拿高德批量扫整座城市。</p></article>
          <article><span>路线计算</span><strong>每天 N−1 段</strong><p>5 个地点只计算 4 段相邻道路，不为未入选候选生成路线。</p></article>
        </div>
      </section>

      <section className={styles.caseSection}>
        <div><p className={styles.kicker}>FIRST REFERENCE CASE</p><h2>青田三日只是案例，平台流程才是产品。</h2><p>这条案例验证了多主题研究、21 个真实高德 POI、15 段相邻路线，以及卡片和地图的双向联动。</p><div className={styles.caseActions}><Link href="/cases/qingtian">打开青田案例</Link><Link href="/case-study">查看产品作品集</Link></div></div>
        <aside><span>CASE / 001</span><strong>青田县</strong><p>3 DAYS · FOOD / CULTURE / SCENERY / HISTORY</p><dl><div><dt>候选核验</dt><dd>21</dd></div><div><dt>每日地点</dt><dd>5–6</dd></div><div><dt>真实路线</dt><dd>15</dd></div></dl></aside>
      </section>
    </main>
  );
}
