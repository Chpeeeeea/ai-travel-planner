import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Planner from "../../Planner";
import type { TripData } from "../../travelTypes";
import { dataLayer, digest } from "../../../platform/server/planning-runtime";
import { assembleTrip } from "../../../platform/server/trip-assembler";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "共享旅行卡片 · AI Travel Planner",
  description: "只读查看由 AI Travel Planner 生成的旅行卡片与路线地图。",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { getDb, planningRuns, tripShareLinks } = await dataLayer();
  const db = getDb();
  const [share] = await db.select().from(tripShareLinks).where(and(
    eq(tripShareLinks.tokenHash, await digest(token)),
    eq(tripShareLinks.status, "active"),
  )).limit(1);
  if (!share || (share.expiresAt && share.expiresAt <= new Date().toISOString())) notFound();
  const [run] = await db.select({ currentStage: planningRuns.currentStage }).from(planningRuns).where(eq(planningRuns.id, share.runId)).limit(1);
  if (run?.currentStage !== "published") notFound();
  const trip = await assembleTrip(share.runId);
  if (!trip?.days.length) notFound();
  return <Planner data={trip as unknown as TripData} />;
}
