import { and, asc, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { normalizeBrief } from "../../../platform/runtime/brief.mjs";
import { dataLayer, digest, routeError, stageOrder } from "../../../platform/server/planning-runtime";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function unauthorized() {
  return Response.json({ error: "Sign in with ChatGPT to create and view travel plans", sign_in_url: "/signin-with-chatgpt?return_to=%2Fstudio" }, { status: 401 });
}

function publicRun(run: {
  id: string;
  destination: string;
  days: number;
  status: string;
  currentStage: string;
  providerPoiCalls: number;
  providerRouteCalls: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: run.id,
    destination: run.destination,
    days: run.days,
    status: run.status,
    current_stage: run.currentStage,
    stage_index: stageOrder.indexOf(run.currentStage as typeof stageOrder[number]),
    provider_poi_calls: run.providerPoiCalls,
    provider_route_calls: run.providerRouteCalls,
    last_error: run.lastError,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
  };
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  try {
    const runId = new URL(request.url).searchParams.get("run_id")?.trim() ?? "";
    const {
      assignments, candidates, getDb, itineraryDays, planningBriefs, planningRunEvents,
      planningRuns, providerMatches, researchEvidence, routeSegments,
    } = await dataLayer();
    const db = getDb();
    if (!runId) {
      const runs = await db.select().from(planningRuns)
        .where(eq(planningRuns.ownerUserId, user.userId))
        .orderBy(desc(planningRuns.updatedAt))
        .limit(20);
      return Response.json({ runs: runs.map(publicRun) });
    }
    const [run] = await db.select().from(planningRuns)
      .where(and(eq(planningRuns.id, runId), eq(planningRuns.ownerUserId, user.userId)))
      .limit(1);
    if (!run) return Response.json({ error: "Travel plan not found" }, { status: 404 });
    const [briefRow, evidenceRows, candidateRows, matchRows, dayRows, events] = await Promise.all([
      db.select().from(planningBriefs).where(eq(planningBriefs.runId, runId)).limit(1).then((items) => items[0]),
      db.select().from(researchEvidence).where(eq(researchEvidence.runId, runId)),
      db.select().from(candidates).where(eq(candidates.runId, runId)),
      db.select().from(providerMatches).where(eq(providerMatches.runId, runId)),
      db.select().from(itineraryDays).where(eq(itineraryDays.runId, runId)).orderBy(asc(itineraryDays.dayNumber)),
      db.select().from(planningRunEvents).where(eq(planningRunEvents.runId, runId)).orderBy(desc(planningRunEvents.createdAt)).limit(30),
    ]);
    const assignmentRows = (await Promise.all(dayRows.map((day) => db.select().from(assignments).where(eq(assignments.dayId, day.id))))).flat();
    const segmentRows = (await Promise.all(dayRows.map((day) => db.select().from(routeSegments).where(eq(routeSegments.dayId, day.id))))).flat();
    const evidenceByLane = Object.fromEntries(["history", "culture", "scenery", "food"].map((lane) => [lane, evidenceRows.filter((item) => item.lane === lane).length]));
    return Response.json({
      run: publicRun(run),
      brief: briefRow ? JSON.parse(briefRow.briefJson) : null,
      progress: {
        evidence_total: evidenceRows.length,
        evidence_by_lane: evidenceByLane,
        shortlisted: candidateRows.filter((item) => item.shortlistRank !== null).length,
        verified: candidateRows.filter((item) => item.verificationStatus === "verified").length,
        needs_confirmation: candidateRows.filter((item) => item.verificationStatus === "needs_confirmation").length,
        scheduled_days: dayRows.length,
        scheduled_places: assignmentRows.length,
        route_segments: segmentRows.length,
        verified_routes: segmentRows.filter((item) => item.status === "verified").length,
      },
      provider_matches: matchRows.length,
      events: events.map((event) => ({
        id: event.id,
        from_stage: event.fromStage,
        to_stage: event.toStage,
        status: event.status,
        message: event.message,
        poi_calls: event.poiCalls,
        route_calls: event.routeCalls,
        created_at: event.createdAt,
      })),
      policy: {
        research_provider_calls: 0,
        shortlist_range: [run.candidateMin, run.candidateMax],
        daily_stops_range: [run.dailyStopsMin, run.dailyStopsMax],
        route_rule: "adjacent_assignments_only",
      },
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  try {
    const brief = normalizeBrief(await request.json());
    const id = crypto.randomUUID();
    const { getDb, planningBriefs, planningRunEvents, planningRuns } = await dataLayer();
    const db = getDb();
    const now = new Date().toISOString();
    await db.insert(planningRuns).values({
      id,
      ownerUserId: user.userId,
      destination: brief.destination,
      days: brief.days,
      inputHash: await digest(JSON.stringify(brief)),
      sourcePolicyJson: JSON.stringify(brief.source_policy),
      candidateMin: brief.candidate_target.min,
      candidateMax: brief.candidate_target.max,
      dailyStopsMin: brief.daily_stops.min,
      dailyStopsMax: brief.daily_stops.max,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(planningBriefs).values({ runId: id, briefJson: JSON.stringify(brief), createdAt: now });
    await db.insert(planningRunEvents).values({
      id: crypto.randomUUID(),
      runId: id,
      toStage: "brief",
      status: "created_by_traveler",
      message: "旅行需求已保存，等待 Research Worker 接管多来源研究",
      createdAt: now,
    });
    return Response.json({ run: { id, destination: brief.destination, days: brief.days, status: "draft", current_stage: "brief" }, brief }, { status: 201 });
  } catch (error) {
    const message = routeError(error);
    return Response.json({ error: message }, { status: message.includes("must be") ? 400 : 500 });
  }
}
