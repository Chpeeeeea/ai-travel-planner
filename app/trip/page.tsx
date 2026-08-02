import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import Planner from "../Planner";
import { requireChatGPTUser } from "../chatgpt-auth";
import type { TripData } from "../travelTypes";
import { dataLayer } from "../../platform/server/planning-runtime";
import { assembleTrip } from "../../platform/server/trip-assembler";
import styles from "./trip.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "旅行卡片地图 · AI Travel Planner",
  description: "查看 AI Travel Planner 生成的行程卡片、候选地点和高德真实道路地图。",
};

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function StatePage({ title, copy, runId }: { title: string; copy: string; runId?: string }) {
  const href = runId ? `/studio?run_id=${encodeURIComponent(runId)}` : "/studio";
  return <main className={styles.statePage}>
    <section>
      <span>AI TRAVEL PLANNER</span>
      <h1>{title}</h1>
      <p>{copy}</p>
      <Link href={href}>返回旅行研究工作台</Link>
    </section>
  </main>;
}

export default async function TripPage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const params = await searchParams;
  const runId = first(params.run_id).trim();
  const returnTo = `/trip${runId ? `?run_id=${encodeURIComponent(runId)}` : ""}`;
  const user = await requireChatGPTUser(returnTo);
  if (!runId) return <StatePage title="还没有选择旅行任务" copy="请从旅行研究工作台打开一个已经完成排程的任务。" />;

  const { getDb, planningRuns } = await dataLayer();
  const [run] = await getDb().select().from(planningRuns)
    .where(and(eq(planningRuns.id, runId), eq(planningRuns.ownerUserId, user.userId)))
    .limit(1);
  if (!run) return <StatePage title="没有找到这次旅行" copy="该任务不存在，或不属于当前登录账号。" />;
  if (!["scheduled", "routing", "published"].includes(run.currentStage)) {
    return <StatePage title="卡片地图还在生成" copy="研究、候选核验和每日排程完成后，这里会自动出现行程卡片与地图。" runId={runId} />;
  }

  const trip = await assembleTrip(runId);
  if (!trip?.days.length) return <StatePage title="还没有可展示的每日行程" copy="任务数据已经保留，请返回工作台查看当前阶段与下一步。" runId={runId} />;
  return <Planner
    data={trip as unknown as TripData}
    backHref={`/studio?run_id=${encodeURIComponent(runId)}`}
    backLabel="返回任务"
    editableRunId={runId}
    shareRunId={runId}
    exportBaseHref={`/api/trips/export?run_id=${encodeURIComponent(runId)}`}
  />;
}
