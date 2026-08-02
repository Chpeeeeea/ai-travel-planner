import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { buildOperationalSnapshot } from "../../../../platform/runtime/operations.mjs";
import { dataLayer, deny, routeError, stageOrder } from "../../../../platform/server/planning-runtime";
import { utcMonthWindow } from "../../../../platform/server/traveler-quota";

const claimableStatuses = ["draft", "queued", "running", "running_with_warnings", "worker_retry"];
const claimableStages = stageOrder.filter((stage) => stage !== "published");

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const generatedAt = new Date().toISOString();
    const month = utcMonthWindow();
    const { getDb, planningRuns, providerUsageEvents, researchLaneJobs } = await dataLayer();
    const db = getDb();
    const claimableWhere = and(
      inArray(planningRuns.currentStage, claimableStages),
      or(
        inArray(planningRuns.status, claimableStatuses),
        and(eq(planningRuns.status, "awaiting_quota"), lt(planningRuns.updatedAt, month.start)),
      ),
      lt(planningRuns.workerAttempt, 5),
      or(isNull(planningRuns.leaseExpiresAt), lt(planningRuns.leaseExpiresAt, generatedAt)),
    );

    const [
      runGroups,
      laneGroups,
      usageGroups,
      ownerRows,
      claimableRows,
      activeLeaseRows,
      expiredLeaseRows,
      archivedRunRows,
      oldestClaimableRows,
    ] = await Promise.all([
      db.select({ status: planningRuns.status, stage: planningRuns.currentStage, count: sql<number>`count(*)` })
        .from(planningRuns).where(isNull(planningRuns.archivedAt)).groupBy(planningRuns.status, planningRuns.currentStage),
      db.select({ status: researchLaneJobs.status, count: sql<number>`count(*)` })
        .from(researchLaneJobs)
        .innerJoin(planningRuns, eq(researchLaneJobs.runId, planningRuns.id))
        .where(isNull(planningRuns.archivedAt))
        .groupBy(researchLaneJobs.status),
      db.select({ kind: providerUsageEvents.kind, calls: sql<number>`coalesce(sum(${providerUsageEvents.calls}), 0)` })
        .from(providerUsageEvents).where(gte(providerUsageEvents.createdAt, month.start)).groupBy(providerUsageEvents.kind),
      db.select({ count: sql<number>`count(distinct ${planningRuns.ownerUserId})` }).from(planningRuns),
      db.select({ count: sql<number>`count(*)` }).from(planningRuns).where(claimableWhere),
      db.select({ count: sql<number>`count(*)` }).from(planningRuns).where(gt(planningRuns.leaseExpiresAt, generatedAt)),
      db.select({ count: sql<number>`count(*)` }).from(planningRuns).where(and(
        isNotNull(planningRuns.leaseExpiresAt),
        lte(planningRuns.leaseExpiresAt, generatedAt),
        ne(planningRuns.currentStage, "published"),
        inArray(planningRuns.status, claimableStatuses),
      )),
      db.select({ count: sql<number>`count(*)` }).from(planningRuns).where(isNotNull(planningRuns.archivedAt)),
      db.select({ updatedAt: planningRuns.updatedAt }).from(planningRuns)
        .where(claimableWhere).orderBy(asc(planningRuns.updatedAt)).limit(1),
    ]);

    return Response.json(buildOperationalSnapshot({
      generatedAt,
      monthStart: month.start,
      resetAt: month.resetAt,
      runGroups,
      laneGroups,
      usageGroups,
      ownerCount: Number(ownerRows[0]?.count ?? 0),
      claimableCount: Number(claimableRows[0]?.count ?? 0),
      activeLeaseCount: Number(activeLeaseRows[0]?.count ?? 0),
      expiredLeaseCount: Number(expiredLeaseRows[0]?.count ?? 0),
      archivedRunCount: Number(archivedRunRows[0]?.count ?? 0),
      oldestClaimableAt: oldestClaimableRows[0]?.updatedAt ?? null,
    }));
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
