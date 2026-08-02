import { and, eq, gte, notInArray } from "drizzle-orm";
import { dataLayer, runtimeSecrets } from "./planning-runtime";

export type ProviderKind = "poi" | "route";

const inactiveStatuses = ["complete", "complete_with_warnings", "failed"];

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function utcMonthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const reset = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), resetAt: reset.toISOString() };
}

export async function travelerQuota(ownerUserId: string) {
  const secrets = await runtimeSecrets();
  const limits = {
    active_runs: positiveInteger(secrets.TRAVELER_ACTIVE_RUN_LIMIT, 3),
    monthly_runs: positiveInteger(secrets.TRAVELER_MONTHLY_RUN_LIMIT, 10),
    monthly_poi_calls: positiveInteger(secrets.TRAVELER_MONTHLY_POI_LIMIT, 200),
    monthly_route_calls: positiveInteger(secrets.TRAVELER_MONTHLY_ROUTE_LIMIT, 200),
  };
  const { start, resetAt } = utcMonthWindow();
  const { getDb, planningRuns, providerUsageEvents } = await dataLayer();
  const db = getDb();
  const [activeRows, monthlyRows, usageRows] = await Promise.all([
    db.select({ id: planningRuns.id }).from(planningRuns).where(and(
      eq(planningRuns.ownerUserId, ownerUserId),
      notInArray(planningRuns.status, inactiveStatuses),
    )),
    db.select({ id: planningRuns.id }).from(planningRuns).where(and(
      eq(planningRuns.ownerUserId, ownerUserId),
      gte(planningRuns.createdAt, start),
    )),
    db.select({ kind: providerUsageEvents.kind, calls: providerUsageEvents.calls }).from(providerUsageEvents).where(and(
      eq(providerUsageEvents.ownerUserId, ownerUserId),
      gte(providerUsageEvents.createdAt, start),
    )),
  ]);
  const poiCalls = usageRows.filter((item) => item.kind === "poi").reduce((sum, item) => sum + item.calls, 0);
  const routeCalls = usageRows.filter((item) => item.kind === "route").reduce((sum, item) => sum + item.calls, 0);
  const usage = {
    active_runs: activeRows.length,
    monthly_runs: monthlyRows.length,
    monthly_poi_calls: poiCalls,
    monthly_route_calls: routeCalls,
  };
  return {
    limits,
    usage,
    remaining: {
      active_runs: Math.max(0, limits.active_runs - usage.active_runs),
      monthly_runs: Math.max(0, limits.monthly_runs - usage.monthly_runs),
      monthly_poi_calls: Math.max(0, limits.monthly_poi_calls - usage.monthly_poi_calls),
      monthly_route_calls: Math.max(0, limits.monthly_route_calls - usage.monthly_route_calls),
    },
    reset_at: resetAt,
  };
}

export async function providerAllowance(ownerUserId: string | null, kind: ProviderKind, requested: number) {
  if (!ownerUserId) return { allowed: requested, quota: null };
  const quota = await travelerQuota(ownerUserId);
  const remaining = kind === "poi" ? quota.remaining.monthly_poi_calls : quota.remaining.monthly_route_calls;
  return { allowed: Math.max(0, Math.min(requested, remaining)), quota };
}

export async function recordProviderUsage(ownerUserId: string | null, runId: string, kind: ProviderKind, calls: number, createdAt = new Date().toISOString()) {
  if (!ownerUserId || calls <= 0) return;
  const { getDb, providerUsageEvents } = await dataLayer();
  await getDb().insert(providerUsageEvents).values({
    id: crypto.randomUUID(),
    ownerUserId,
    runId,
    kind,
    calls,
    createdAt,
  });
}

export function creationQuotaError(quota: Awaited<ReturnType<typeof travelerQuota>>) {
  if (!quota.remaining.active_runs) return "你已有过多进行中的旅行任务，请等待任务完成后再创建。";
  if (!quota.remaining.monthly_runs) return "本月可创建的旅行任务已用完，请在额度重置后再试。";
  return "";
}
