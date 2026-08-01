import { asc, eq } from "drizzle-orm";
import { normalizeAmapRoute, straightLineFallback } from "../../../../platform/runtime/provider.mjs";
import { routeModeForPair } from "../../../../platform/runtime/schedule.mjs";
import { AmapProviderError, amapWebServiceKey, requestAmapRoute, type AmapRouteMode } from "../../../../platform/server/amap-provider";
import { dataLayer, deny, digest, routeError } from "../../../../platform/server/planning-runtime";

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function geometry(value: string | null) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

async function routeData(runId: string) {
  const { assignments, candidates, getDb, itineraryDays, providerMatches, routeSegments } = await dataLayer();
  const db = getDb();
  const [days, candidateRows, matchRows] = await Promise.all([
    db.select().from(itineraryDays).where(eq(itineraryDays.runId, runId)).orderBy(asc(itineraryDays.dayNumber)),
    db.select().from(candidates).where(eq(candidates.runId, runId)),
    db.select().from(providerMatches).where(eq(providerMatches.runId, runId)),
  ]);
  const assignmentRows = (await Promise.all(days.map((day) =>
    db.select().from(assignments).where(eq(assignments.dayId, day.id)).orderBy(asc(assignments.orderIndex))))).flat();
  const segmentRows = (await Promise.all(days.map((day) =>
    db.select().from(routeSegments).where(eq(routeSegments.dayId, day.id))))).flat();
  return { db, days, candidateRows, matchRows, assignmentRows, segmentRows };
}

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const runId = new URL(request.url).searchParams.get("run_id") ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { planningRuns } = await dataLayer();
    const data = await routeData(runId);
    const [run] = await data.db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const candidateById = new Map(data.candidateRows.map((item) => [item.id, item]));
    const assignmentById = new Map(data.assignmentRows.map((item) => [item.id, item]));
    return Response.json({
      run: { id: run.id, current_stage: run.currentStage, provider_route_calls: run.providerRouteCalls },
      counts: {
        total: data.segmentRows.length,
        verified: data.segmentRows.filter((item) => item.status === "verified").length,
        fallback: data.segmentRows.filter((item) => item.status === "fallback_straight_line").length,
        pending: data.segmentRows.filter((item) => item.status === "pending").length,
      },
      segments: data.segmentRows.map((segment) => {
        const from = assignmentById.get(segment.fromAssignmentId);
        const to = assignmentById.get(segment.toAssignmentId);
        return {
          id: segment.id,
          day_id: segment.dayId,
          from_assignment_id: segment.fromAssignmentId,
          to_assignment_id: segment.toAssignmentId,
          from_name: candidateById.get(from?.candidateId ?? "")?.canonicalName ?? "",
          to_name: candidateById.get(to?.candidateId ?? "")?.canonicalName ?? "",
          mode: segment.mode,
          provider: segment.provider,
          distance_m: segment.distanceM,
          duration_s: segment.durationS,
          geometry: geometry(segment.geometryJson),
          status: segment.status,
          verified_at: segment.verifiedAt,
        };
      }),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as { run_id?: string; limit?: number; prepare_only?: boolean; retry_fallback?: boolean };
    const runId = String(payload.run_id ?? "").trim().slice(0, 100);
    const limit = Math.max(1, Math.min(5, Math.floor(Number(payload.limit) || 5)));
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    if (!payload.prepare_only) {
      try { await amapWebServiceKey(); }
      catch (error) {
        if (error instanceof AmapProviderError && error.code === "MISSING_KEY") {
          return Response.json({ error: error.message, required_secret: "AMAP_WEBSERVICE_KEY" }, { status: 503 });
        }
        throw error;
      }
    }
    const { planningBriefs, planningRunEvents, planningRuns, routeSegments } = await dataLayer();
    let data = await routeData(runId);
    const [run] = await data.db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    if (run.currentStage === "published") {
      return Response.json({ run: { id: runId, current_stage: "published", provider_route_calls: run.providerRouteCalls }, idempotent: true });
    }
    if (!["scheduled", "routing"].includes(run.currentStage)) {
      return Response.json({ error: `Routing requires scheduled or routing stage (current stage: ${run.currentStage})` }, { status: 409 });
    }
    const [briefRow] = await data.db.select().from(planningBriefs).where(eq(planningBriefs.runId, runId)).limit(1);
    const brief = briefRow ? JSON.parse(briefRow.briefJson) : {};
    const preference = String(brief.transport_mode ?? "mixed");
    const verifiedMatchByCandidate = new Map(data.matchRows.filter((item) => item.status === "verified").map((item) => [item.candidateId, item]));
    const existingPairs = new Set(data.segmentRows.map((item) => `${item.dayId}:${item.fromAssignmentId}:${item.toAssignmentId}`));
    const newRows = [];
    for (const day of data.days) {
      const ordered = data.assignmentRows.filter((item) => item.dayId === day.id).sort((left, right) => left.orderIndex - right.orderIndex);
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const from = ordered[index];
        const to = ordered[index + 1];
        const key = `${day.id}:${from.id}:${to.id}`;
        if (existingPairs.has(key)) continue;
        const fromMatch = verifiedMatchByCandidate.get(from.candidateId);
        const toMatch = verifiedMatchByCandidate.get(to.candidateId);
        if (!fromMatch || !toMatch || fromMatch.lng === null || fromMatch.lat === null || toMatch.lng === null || toMatch.lat === null) {
          return Response.json({ error: "Every adjacent assignment requires a verified POI with GCJ-02 coordinates" }, { status: 422 });
        }
        const mode = routeModeForPair(preference, { lng: fromMatch.lng, lat: fromMatch.lat }, { lng: toMatch.lng, lat: toMatch.lat });
        newRows.push({
          id: `route-${(await digest(`${runId}:${day.id}:${from.id}:${to.id}`)).slice(0, 28)}`,
          dayId: day.id,
          fromAssignmentId: from.id,
          toAssignmentId: to.id,
          mode,
          status: "pending",
        });
      }
    }
    for (const batch of chunks(newRows, 8)) await data.db.insert(routeSegments).values(batch);
    const routingStartedAt = new Date().toISOString();
    await data.db.update(planningRuns).set({ currentStage: "routing", status: "running", updatedAt: routingStartedAt }).where(eq(planningRuns.id, runId));
    if (run.currentStage === "scheduled") {
      await data.db.insert(planningRunEvents).values({
        id: crypto.randomUUID(), runId, fromStage: "scheduled", toStage: "routing", status: "adjacent_manifest_created",
        poiCalls: 0, routeCalls: 0, message: `Created ${newRows.length} adjacent-only route segments`,
      });
    }
    data = await routeData(runId);
    if (payload.prepare_only) {
      return Response.json({
        run: { id: runId, current_stage: "routing", provider_route_calls: run.providerRouteCalls },
        prepared: newRows.length,
        pending: data.segmentRows.filter((item) => item.status === "pending").length,
        provider_calls: 0,
      }, { status: 201 });
    }

    const eligible = data.segmentRows.filter((item) => item.status === "pending" || (payload.retry_fallback && item.status === "fallback_straight_line")).slice(0, limit);
    const assignmentById = new Map(data.assignmentRows.map((item) => [item.id, item]));
    const verifiedMatches = new Map(data.matchRows.filter((item) => item.status === "verified").map((item) => [item.candidateId, item]));
    let calls = 0;
    let stoppedEarly = false;
    let lastError = "";
    const results = [];
    for (const segment of eligible) {
      const fromAssignment = assignmentById.get(segment.fromAssignmentId);
      const toAssignment = assignmentById.get(segment.toAssignmentId);
      const from = fromAssignment ? verifiedMatches.get(fromAssignment.candidateId) : null;
      const to = toAssignment ? verifiedMatches.get(toAssignment.candidateId) : null;
      if (!from || !to || from.lng === null || from.lat === null || to.lng === null || to.lat === null) continue;
      calls += 1;
      try {
        const response = await requestAmapRoute({
          mode: segment.mode as AmapRouteMode,
          origin: { lng: from.lng, lat: from.lat, providerPoiId: from.providerPoiId },
          destination: { lng: to.lng, lat: to.lat, providerPoiId: to.providerPoiId },
        });
        const normalized = normalizeAmapRoute(response, segment.mode);
        await data.db.update(routeSegments).set({
          provider: normalized.provider,
          distanceM: normalized.distanceM,
          durationS: normalized.durationS,
          geometryJson: JSON.stringify(normalized.geometry),
          status: "verified",
          verifiedAt: new Date().toISOString(),
        }).where(eq(routeSegments.id, segment.id));
        results.push({ segment_id: segment.id, status: "verified", distance_m: normalized.distanceM, duration_s: normalized.durationS });
      } catch (error) {
        const providerError = error instanceof AmapProviderError ? error : new AmapProviderError(routeError(error));
        lastError = `${providerError.code}: ${providerError.message}`;
        if (providerError.fatal || providerError.retryable) {
          stoppedEarly = true;
          results.push({ segment_id: segment.id, status: "pending", error_code: providerError.code });
          break;
        }
        const fallback = straightLineFallback({ lng: from.lng, lat: from.lat }, { lng: to.lng, lat: to.lat }, segment.mode);
        await data.db.update(routeSegments).set({
          provider: null,
          distanceM: null,
          durationS: null,
          geometryJson: JSON.stringify(fallback.geometry),
          status: fallback.status,
          verifiedAt: null,
        }).where(eq(routeSegments.id, segment.id));
        results.push({ segment_id: segment.id, status: fallback.status, error_code: providerError.code });
      }
    }
    const refreshed = await routeData(runId);
    const pending = refreshed.segmentRows.filter((item) => item.status === "pending").length;
    const fallbacks = refreshed.segmentRows.filter((item) => item.status === "fallback_straight_line").length;
    const complete = pending === 0 && refreshed.segmentRows.length > 0;
    const providerRouteCalls = run.providerRouteCalls + calls;
    await refreshed.db.update(planningRuns).set({
      currentStage: complete ? "published" : "routing",
      status: complete ? (fallbacks ? "complete_with_warnings" : "complete") : (lastError ? "running_with_warnings" : "running"),
      providerRouteCalls,
      lastError: lastError || null,
      updatedAt: new Date().toISOString(),
    }).where(eq(planningRuns.id, runId));
    await refreshed.db.insert(planningRunEvents).values({
      id: crypto.randomUUID(), runId, fromStage: "routing", toStage: "routing",
      status: lastError ? "route_batch_warning" : "route_batch_complete",
      poiCalls: 0, routeCalls: calls,
      message: `Processed ${results.length} adjacent route segments; ${pending} remain`,
    });
    if (complete) {
      await refreshed.db.insert(planningRunEvents).values({
        id: crypto.randomUUID(), runId, fromStage: "routing", toStage: "published",
        status: fallbacks ? "published_with_route_fallbacks" : "published",
        poiCalls: 0, routeCalls: 0,
        message: `Published itinerary with ${refreshed.segmentRows.length - fallbacks} verified routes and ${fallbacks} visual fallbacks`,
      });
    }
    return Response.json({
      run: { id: runId, current_stage: complete ? "published" : "routing", provider_route_calls: providerRouteCalls },
      attempted_provider_calls: calls,
      processed: results.length,
      pending,
      fallback_segments: fallbacks,
      stopped_early: stoppedEarly,
      results,
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
