import { desc, eq } from "drizzle-orm";
import { normalizeBrief } from "../../../platform/runtime/brief.mjs";
import { canceledRunResponse, dataLayer, deny, digest, routeError, stageOrder, type RunStage } from "../../../platform/server/planning-runtime";

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id");
    const { getDb, planningBriefs, planningRunEvents, planningRuns } = await dataLayer();
    const db = getDb();
    if (id) {
      const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, id)).limit(1);
      if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
      const [brief] = await db.select().from(planningBriefs).where(eq(planningBriefs.runId, id)).limit(1);
      const events = await db.select().from(planningRunEvents).where(eq(planningRunEvents.runId, id)).orderBy(desc(planningRunEvents.createdAt));
      return Response.json({ run, brief: brief ? JSON.parse(brief.briefJson) : null, events });
    }
    const runs = await db.select().from(planningRuns).orderBy(desc(planningRuns.updatedAt)).limit(20);
    return Response.json({ runs });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const brief = normalizeBrief(await request.json());
    const id = crypto.randomUUID();
    const { getDb, planningBriefs, planningRunEvents, planningRuns } = await dataLayer();
    const db = getDb();
    await db.insert(planningRuns).values({
      id,
      destination: brief.destination,
      days: brief.days,
      inputHash: await digest(JSON.stringify(brief)),
      sourcePolicyJson: JSON.stringify(brief.source_policy),
      candidateMin: brief.candidate_target.min,
      candidateMax: brief.candidate_target.max,
      dailyStopsMin: brief.daily_stops.min,
      dailyStopsMax: brief.daily_stops.max,
    });
    await db.insert(planningBriefs).values({ runId: id, briefJson: JSON.stringify(brief) });
    await db.insert(planningRunEvents).values({ id: crypto.randomUUID(), runId: id, toStage: "brief", status: "created", message: "PlanningRun created" });
    return Response.json({ run: { id, status: "draft", current_stage: "brief" }, brief }, { status: 201 });
  } catch (error) {
    const message = routeError(error);
    return Response.json({ error: message }, { status: message.includes("must be") ? 400 : 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as { id?: string; to_stage?: RunStage; status?: string; message?: string; poi_calls?: number; route_calls?: number };
    if (!payload.id || !payload.to_stage || !stageOrder.includes(payload.to_stage)) {
      return Response.json({ error: "id and a valid to_stage are required" }, { status: 400 });
    }
    const { getDb, planningRunEvents, planningRuns } = await dataLayer();
    const db = getDb();
    const [current] = await db.select().from(planningRuns).where(eq(planningRuns.id, payload.id)).limit(1);
    if (!current) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const canceled = canceledRunResponse(current);
    if (canceled) return canceled;
    const fromIndex = stageOrder.indexOf(current.currentStage as RunStage);
    const toIndex = stageOrder.indexOf(payload.to_stage);
    if (toIndex < fromIndex || toIndex > fromIndex + 1) {
      return Response.json({ error: `Invalid stage transition: ${current.currentStage} -> ${payload.to_stage}` }, { status: 409 });
    }
    const poiCalls = Math.max(0, Math.floor(Number(payload.poi_calls ?? 0)));
    const routeCalls = Math.max(0, Math.floor(Number(payload.route_calls ?? 0)));
    const status = String(payload.status || (payload.to_stage === "published" ? "complete" : "running")).slice(0, 30);
    await db.update(planningRuns).set({
      currentStage: payload.to_stage,
      status,
      providerPoiCalls: current.providerPoiCalls + poiCalls,
      providerRouteCalls: current.providerRouteCalls + routeCalls,
      updatedAt: new Date().toISOString(),
    }).where(eq(planningRuns.id, payload.id));
    await db.insert(planningRunEvents).values({
      id: crypto.randomUUID(), runId: payload.id, fromStage: current.currentStage, toStage: payload.to_stage,
      status, poiCalls, routeCalls, message: String(payload.message || "").slice(0, 500),
    });
    return Response.json({ run: { id: payload.id, current_stage: payload.to_stage, status } });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
