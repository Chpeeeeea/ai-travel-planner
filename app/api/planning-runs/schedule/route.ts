import { asc, eq } from "drizzle-orm";
import { planVerifiedItinerary } from "../../../../platform/runtime/schedule.mjs";
import { canceledRunResponse, dataLayer, deny, digest, parseJsonList, routeError } from "../../../../platform/server/planning-runtime";

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function raw(value: string | null) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const runId = new URL(request.url).searchParams.get("run_id") ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { assignments, candidates, getDb, itineraryDays, planningRuns } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const [dayRows, candidateRows] = await Promise.all([
      db.select().from(itineraryDays).where(eq(itineraryDays.runId, runId)).orderBy(asc(itineraryDays.dayNumber)),
      db.select().from(candidates).where(eq(candidates.runId, runId)),
    ]);
    const assignmentRows = (await Promise.all(dayRows.map((day) =>
      db.select().from(assignments).where(eq(assignments.dayId, day.id)).orderBy(asc(assignments.orderIndex))))).flat();
    const candidateById = new Map(candidateRows.map((item) => [item.id, item]));
    return Response.json({
      run: { id: run.id, current_stage: run.currentStage },
      days: dayRows.map((day) => ({
        id: day.id,
        day_number: day.dayNumber,
        title: day.title,
        window: { start: day.windowStart, end: day.windowEnd },
        assignments: assignmentRows.filter((item) => item.dayId === day.id).map((item) => ({
          id: item.id,
          order_index: item.orderIndex,
          candidate_id: item.candidateId,
          name: candidateById.get(item.candidateId)?.canonicalName ?? "",
          notes: item.notes,
          locked: item.locked,
        })),
      })),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as { run_id?: string; preferred_stops_per_day?: number };
    const runId = String(payload.run_id ?? "").trim().slice(0, 100);
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { assignments, candidates, getDb, itineraryDays, planningBriefs, planningRunEvents, planningRuns, providerMatches } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const canceled = canceledRunResponse(run);
    if (canceled) return canceled;
    if (["scheduled", "routing", "published"].includes(run.currentStage)) {
      const existing = await db.select().from(itineraryDays).where(eq(itineraryDays.runId, runId));
      return Response.json({ run: { id: runId, current_stage: run.currentStage }, days: existing.length, idempotent: true });
    }
    if (run.currentStage !== "verifying") {
      return Response.json({ error: `Scheduling requires verifying stage (current stage: ${run.currentStage})` }, { status: 409 });
    }
    const [briefRow] = await db.select().from(planningBriefs).where(eq(planningBriefs.runId, runId)).limit(1);
    if (!briefRow) return Response.json({ error: "Planning brief not found" }, { status: 409 });
    const [candidateRows, matchRows] = await Promise.all([
      db.select().from(candidates).where(eq(candidates.runId, runId)),
      db.select().from(providerMatches).where(eq(providerMatches.runId, runId)),
    ]);
    const pending = candidateRows.filter((item) => ["candidate", "verification_failed"].includes(item.verificationStatus));
    if (pending.length) {
      return Response.json({ error: "All shortlist candidates must finish POI verification before scheduling", pending_candidates: pending.length }, { status: 409 });
    }
    const verifiedMatchByCandidate = new Map(matchRows.filter((item) => item.status === "verified").map((item) => [item.candidateId, item]));
    const brief = JSON.parse(briefRow.briefJson);
    const plannerInput = candidateRows.map((candidate) => {
      const match = verifiedMatchByCandidate.get(candidate.id);
      return {
        id: candidate.id,
        canonicalName: candidate.canonicalName,
        aliases: parseJsonList(candidate.aliasesJson),
        themes: parseJsonList(candidate.themesJson),
        whyVisit: candidate.whyVisit,
        stayMinutes: candidate.stayMinutes,
        score: candidate.score,
        verificationStatus: candidate.verificationStatus,
        providerPoiId: match?.providerPoiId ?? null,
        location: match?.lng !== null && match?.lng !== undefined && match?.lat !== null && match?.lat !== undefined
          ? { lng: match.lng, lat: match.lat }
          : null,
        providerDetail: raw(match?.rawJson ?? null),
      };
    });
    const plan = planVerifiedItinerary({
      brief,
      candidates: plannerInput,
      dailyMinimum: run.dailyStopsMin,
      dailyMaximum: run.dailyStopsMax,
      preferred: payload.preferred_stops_per_day ?? 5,
    });
    if (!plan.ok) {
      return Response.json({ error: plan.message, code: plan.code, unresolved_must_visit: plan.unresolvedMustVisit ?? [], verified_count: plan.verifiedCount }, { status: 422 });
    }
    await db.delete(itineraryDays).where(eq(itineraryDays.runId, runId));
    const dayRows = await Promise.all(plan.days.map(async (day: { dayNumber: number; title: string }) => ({
      id: `day-${(await digest(`${runId}:${day.dayNumber}`)).slice(0, 28)}`,
      runId,
      dayNumber: day.dayNumber,
      title: day.title,
      windowStart: String(brief.daily_window?.start ?? "09:00"),
      windowEnd: String(brief.daily_window?.end ?? "18:00"),
    })));
    await db.insert(itineraryDays).values(dayRows);
    const dayIdByNumber = new Map(dayRows.map((day) => [day.dayNumber, day.id]));
    const assignmentRows = await Promise.all(plan.days.flatMap((day: { dayNumber: number; assignments: Array<{ candidateId: string; orderIndex: number; notes: string }> }) =>
      day.assignments.map(async (assignment) => ({
        id: `assignment-${(await digest(`${runId}:${day.dayNumber}:${assignment.candidateId}`)).slice(0, 24)}`,
        dayId: dayIdByNumber.get(day.dayNumber)!,
        candidateId: assignment.candidateId,
        orderIndex: assignment.orderIndex,
        notes: assignment.notes,
        locked: false,
      }))));
    for (const batch of chunks(assignmentRows, 10)) await db.insert(assignments).values(batch);
    const now = new Date().toISOString();
    await db.update(planningRuns).set({ currentStage: "scheduled", status: "running", lastError: null, updatedAt: now }).where(eq(planningRuns.id, runId));
    await db.insert(planningRunEvents).values({
      id: crypto.randomUUID(), runId, fromStage: "verifying", toStage: "scheduled", status: "itinerary_planned",
      poiCalls: 0, routeCalls: 0,
      message: `Selected ${plan.selectedCount} verified POIs across ${plan.days.length} days; prepared ${plan.routeSegmentCount} adjacent route segments`,
    });
    return Response.json({
      run: { id: runId, current_stage: "scheduled", provider_poi_calls: run.providerPoiCalls, provider_route_calls: run.providerRouteCalls },
      verified_candidates: plan.verifiedCount,
      selected_candidates: plan.selectedCount,
      adjacent_route_segments: plan.routeSegmentCount,
      days: plan.days,
      provider_calls: 0,
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
