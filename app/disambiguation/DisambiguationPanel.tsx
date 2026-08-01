"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./disambiguation.module.css";

type Match = { id: string; name: string; address: string; type: string; district: string; city: string; confidence: number | null; location: { lng: number; lat: number; coord_system: string | null } | null };
type Candidate = { id: string; canonical_name: string; aliases: string[]; themes: string[]; why_visit: string; risk_flags: string[]; matches: Match[] };
type Review = { run: { id: string; destination: string; current_stage: string; status: string }; count: number; candidates: Candidate[]; error?: string };

function amapUrl(match: Match) {
  if (!match.location) return "#";
  return `https://uri.amap.com/marker?position=${match.location.lng},${match.location.lat}&name=${encodeURIComponent(match.name)}&src=ai-travel-planner&coordinate=gaode&callnative=0`;
}

export default function DisambiguationPanel({ runId, destination }: { runId: string; destination: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/trips/disambiguation?run_id=${encodeURIComponent(runId)}`);
    const data = await response.json() as Review;
    if (!response.ok) throw new Error(data.error || "无法读取待确认地点");
    setReview(data);
    setError("");
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trips/disambiguation?run_id=${encodeURIComponent(runId)}`).then(async (response) => {
      const data = await response.json() as Review;
      if (!response.ok) throw new Error(data.error || "无法读取待确认地点");
      if (!cancelled) { setReview(data); setError(""); }
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "无法读取待确认地点"); });
    return () => { cancelled = true; };
  }, [runId]);

  async function decide(candidateId: string, action: "confirm" | "reject", matchId?: string) {
    setBusyId(candidateId);
    setError("");
    try {
      const response = await fetch("/api/trips/disambiguation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: runId, candidate_id: candidateId, match_id: matchId, action }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "保存确认结果失败");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存确认结果失败");
    } finally {
      setBusyId("");
    }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}><Link href={`/studio?run_id=${encodeURIComponent(runId)}`}>← 返回工作台</Link><span>AI TRAVEL PLANNER</span></header>
    <section className={styles.hero}><p>POI DISAMBIGUATION</p><h1>确认 {destination} 的同名地点</h1><span>只选择名称、行政区、地址都与研究对象一致的地点。确认不会新增高德调用，排除也不会把错误坐标带入路线。</span></section>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!review ? <section className={styles.loading}>正在读取高德候选…</section> : review.candidates.length ? (
      <section className={styles.list}>{review.candidates.map((candidate, index) => <article className={styles.candidate} key={candidate.id}>
        <header><span>{String(index + 1).padStart(2, "0")}</span><div><p>{candidate.themes.join(" · ") || "待确认地点"}</p><h2>{candidate.canonical_name}</h2><small>{candidate.why_visit}</small></div></header>
        {candidate.aliases.length > 0 && <p className={styles.aliases}>别名：{candidate.aliases.join("、")}</p>}
        <div className={styles.matches}>{candidate.matches.map((match) => <section key={match.id}>
          <div><strong>{match.name}</strong><span>{[match.city, match.district].filter(Boolean).join(" · ") || "行政区待核对"}</span><p>{match.address || "地址待核对"}</p><small>{match.type || "类型待核对"} · 匹配置信度 {match.confidence == null ? "待评估" : `${Math.round(match.confidence * 100)}%`}</small></div>
          <div>{match.location && <a href={amapUrl(match)} target="_blank" rel="noreferrer">在高德查看</a>}<button disabled={busyId === candidate.id || !match.location} onClick={() => decide(candidate.id, "confirm", match.id)}>选择此地点</button></div>
        </section>)}</div>
        <button className={styles.reject} disabled={busyId === candidate.id} onClick={() => decide(candidate.id, "reject")}>这些都不是研究中的地点，排除此候选</button>
      </article>)}</section>
    ) : <section className={styles.complete}><span>✓</span><h2>待确认地点已经处理完毕</h2><p>任务已重新进入持久化队列，Research Worker 在线时会继续完成每日排程与相邻道路。</p><Link href={`/studio?run_id=${encodeURIComponent(runId)}`}>查看任务进度</Link></section>}
  </main>;
}
