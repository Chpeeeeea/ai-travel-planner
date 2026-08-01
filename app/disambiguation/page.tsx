import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { dataLayer } from "../../platform/server/planning-runtime";
import DisambiguationPanel from "./DisambiguationPanel";
import styles from "./disambiguation.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "确认同名地点 · AI Travel Planner",
  description: "核对同名或跨城的高德地点候选，确认后继续生成旅行日程。",
};

type SearchValue = string | string[] | undefined;

export default async function DisambiguationPage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const params = await searchParams;
  const value = params.run_id;
  const runId = (Array.isArray(value) ? value[0] : value ?? "").trim();
  const user = await requireChatGPTUser(`/disambiguation${runId ? `?run_id=${encodeURIComponent(runId)}` : ""}`);
  if (!runId) return <main className={styles.state}><h1>还没有选择旅行任务</h1><Link href="/studio">返回工作台</Link></main>;
  const { getDb, planningRuns } = await dataLayer();
  const [run] = await getDb().select({ id: planningRuns.id, destination: planningRuns.destination }).from(planningRuns)
    .where(and(eq(planningRuns.id, runId), eq(planningRuns.ownerUserId, user.userId)))
    .limit(1);
  if (!run) return <main className={styles.state}><h1>没有找到这次旅行</h1><p>该任务不存在，或不属于当前账号。</p><Link href="/studio">返回工作台</Link></main>;
  return <DisambiguationPanel runId={run.id} destination={run.destination} />;
}
