function countMap(rows, keyName) {
  const result = {};
  for (const row of rows ?? []) {
    const key = String(row?.[keyName] ?? "unknown");
    result[key] = (result[key] ?? 0) + Math.max(0, Number(row?.count) || 0);
  }
  return result;
}

function usageMap(rows) {
  const result = { poi: 0, route: 0 };
  for (const row of rows ?? []) {
    const kind = String(row?.kind ?? "");
    if (kind === "poi" || kind === "route") result[kind] += Math.max(0, Number(row?.calls) || 0);
  }
  return result;
}

/**
 * @param {{
 *   generatedAt: string,
 *   monthStart: string,
 *   resetAt: string,
 *   runGroups?: Array<{status: string, stage: string, count: number}>,
 *   laneGroups?: Array<{status: string, count: number}>,
 *   usageGroups?: Array<{kind: string, calls: number}>,
 *   ownerCount?: number,
 *   claimableCount?: number,
 *   activeLeaseCount?: number,
 *   expiredLeaseCount?: number,
 *   archivedRunCount?: number,
 *   oldestClaimableAt?: string | null,
 * }} input
 */
export function buildOperationalSnapshot({
  generatedAt,
  monthStart,
  resetAt,
  runGroups = [],
  laneGroups = [],
  usageGroups = [],
  ownerCount = 0,
  claimableCount = 0,
  activeLeaseCount = 0,
  expiredLeaseCount = 0,
  archivedRunCount = 0,
  oldestClaimableAt = null,
}) {
  const now = new Date(generatedAt);
  const runStatus = countMap(runGroups, "status");
  const runStage = countMap(runGroups, "stage");
  const laneStatus = countMap(laneGroups, "status");
  const usage = usageMap(usageGroups);
  const oldest = oldestClaimableAt ? new Date(oldestClaimableAt) : null;
  const oldestWaitSeconds = oldest && Number.isFinite(oldest.getTime())
    ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1000))
    : null;
  const attention = [];
  if (expiredLeaseCount > 0) attention.push("expired_leases");
  if ((runStatus.failed ?? 0) > 0) attention.push("failed_runs");
  if ((laneStatus.failed ?? 0) > 0) attention.push("failed_research_lanes");
  if ((runStatus.awaiting_confirmation ?? 0) > 0) attention.push("awaiting_confirmation");
  if ((runStatus.awaiting_quota ?? 0) > 0) attention.push("awaiting_quota");
  if (oldestWaitSeconds !== null && oldestWaitSeconds > 900) attention.push("queue_wait_over_15m");

  let state = "idle";
  if (attention.length) state = "attention";
  else if (activeLeaseCount > 0) state = "working";
  else if (claimableCount > 0) state = "waiting_for_worker";

  return {
    generated_at: generatedAt,
    state,
    attention,
    travelers: { total: Math.max(0, Number(ownerCount) || 0) },
    queue: {
      claimable: Math.max(0, Number(claimableCount) || 0),
      active_leases: Math.max(0, Number(activeLeaseCount) || 0),
      expired_leases: Math.max(0, Number(expiredLeaseCount) || 0),
      oldest_claimable_at: oldestClaimableAt,
      oldest_wait_seconds: oldestWaitSeconds,
    },
    runs: {
      active_total: Object.values(runStatus).reduce((sum, count) => sum + count, 0),
      archived: Math.max(0, Number(archivedRunCount) || 0),
      by_status: runStatus,
      by_stage: runStage,
    },
    research_lanes: { by_status: laneStatus },
    provider_usage: {
      month_start: monthStart,
      reset_at: resetAt,
      poi_calls: usage.poi,
      route_calls: usage.route,
      total_calls: usage.poi + usage.route,
    },
  };
}
