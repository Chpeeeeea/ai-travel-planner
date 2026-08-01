import { and, asc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { dataLayer, digest, routeError } from "../../../../platform/server/planning-runtime";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function cleanIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim().slice(0, 100)).filter(Boolean);
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to edit this travel plan" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  try {
    const payload = await request.json() as { run_id?: string; day_id?: string; poi_ids?: string[] };
    const runId = String(payload.run_id ?? "").trim().slice(0, 100);
    const dayId = String(payload.day_id ?? "").trim().slice(0, 100);
    const poiIds = cleanIds(payload.poi_ids);
    if (!runId || !dayId) return Response.json({ error: "run_id and day_id are required" }, { status: 400 });
    if (!poiIds.length || poiIds.length > 8 || new Set(poiIds).size !== poiIds.length) {
      return Response.json({ error: "poi_ids must contain 1–8 unique places" }, { status: 400 });
    }

    const { assignments, candidates, getDb, itineraryDays, planningRunEvents, planningRuns, providerMatches, routeSegments } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns)
      .where(and(eq(planningRuns.id, runId), eq(planningRuns.ownerUserId, user.userId)))
      .limit(1);
    if (!run) return Response.json({ error: "Travel plan not found" }, { status: 404 });
    if (!["scheduled", "routing", "published"].includes(run.currentStage)) {
      return Response.json({ error: `Itinerary editing requires a scheduled plan (current stage: ${run.currentStage})` }, { status: 409 });
    }
    const [day] = await db.select().from(itineraryDays).where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.runId, runId))).limit(1);
    if (!day) return Response.json({ error: "Itinerary day not found" }, { status: 404 });

    const [candidateRows, matchRows, existingAssignments] = await Promise.all([
      db.select().from(candidates).where(and(eq(candidates.runId, runId), inArray(candidates.id, poiIds))),
      db.select().from(providerMatches).where(and(eq(providerMatches.runId, runId), inArray(providerMatches.candidateId, poiIds))),
      db.select().from(assignments).where(eq(assignments.dayId, dayId)).orderBy(asc(assignments.orderIndex)),
    ]);
    const verifiedCandidates = new Set(candidateRows.filter((item) => item.verificationStatus === "verified").map((item) => item.id));
    const locatedMatches = new Set(matchRows.filter((item) => item.status === "verified" && item.lng !== null && item.lat !== null).map((item) => item.candidateId));
    const invalid = poiIds.filter((id) => !verifiedCandidates.has(id) || !locatedMatches.has(id));
    if (candidateRows.length !== poiIds.length || invalid.length) {
      return Response.json({ error: "Every itinerary place must be a verified POI with GCJ-02 coordinates", invalid_poi_ids: invalid }, { status: 422 });
    }
    const existingOrder = existingAssignments.map((item) => item.candidateId);
    if (existingOrder.length === poiIds.length && existingOrder.every((id, index) => id === poiIds[index])) {
      return Response.json({ run: { id: runId, current_stage: run.currentStage }, day_id: dayId, assignments: poiIds.length, idempotent: true });
    }

    const existingByCandidate = new Map(existingAssignments.map((item) => [item.candidateId, item]));
    const assignmentRows = await Promise.all(poiIds.map(async (candidateId, orderIndex) => {
      const existing = existingByCandidate.get(candidateId);
      return {
        id: `assignment-${(await digest(`${runId}:${day.dayNumber}:${candidateId}`)).slice(0, 24)}`,
        dayId,
        candidateId,
        orderIndex,
        arrivalTime: null,
        departureTime: null,
        locked: existing?.locked ?? false,
        notes: existing?.notes || "旅行者自定义加入，等待真实道路重新计算",
      };
    }));
    const now = new Date().toISOString();
    await db.batch([
      db.delete(routeSegments).where(eq(routeSegments.dayId, dayId)),
      db.delete(assignments).where(eq(assignments.dayId, dayId)),
      db.insert(assignments).values(assignmentRows),
      db.update(planningRuns).set({ currentStage: "scheduled", status: "queued", lastError: null, updatedAt: now }).where(eq(planningRuns.id, runId)),
      db.insert(planningRunEvents).values({
        id: crypto.randomUUID(),
        runId,
        fromStage: run.currentStage,
        toStage: "scheduled",
        status: "traveler_itinerary_edited",
        poiCalls: 0,
        routeCalls: 0,
        message: `Traveler updated Day ${day.dayNumber} to ${poiIds.length} stops; adjacent roads queued for recalculation`,
        createdAt: now,
      }),
    ]);
    return Response.json({
      run: { id: runId, current_stage: "scheduled", status: "queued" },
      day_id: dayId,
      assignments: poiIds.length,
      invalidated_route_segments: true,
      reroute_queued: true,
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
