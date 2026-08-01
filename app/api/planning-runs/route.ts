import { desc, eq } from "drizzle-orm";

type BriefInput = {
  destination?: string;
  days?: number;
  interests?: string[];
  pace?: string;
  source_policy?: string[];
  candidate_target?: { min?: number; max?: number };
  daily_stops?: { min?: number; max?: number };
};

const stageOrder = ["brief", "researching", "shortlisted", "verifying", "scheduled", "routing", "published"] as const;
type RunStage = typeof stageOrder[number];

async function runtimeSecrets() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as { PLANNING_RUN_WRITE_TOKEN?: string };
}

async function dataLayer() {
  const [{ getDb }, schema] = await Promise.all([import("../../../db"), import("../../../db/schema")]);
  return { getDb, ...schema };
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(request: Request) {
  const expected = (await runtimeSecrets()).PLANNING_RUN_WRITE_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  return await digest(expected) === await digest(supplied);
}

async function deny(request: Request) {
  if (!(await runtimeSecrets()).PLANNING_RUN_WRITE_TOKEN) {
    return Response.json({ error: "PlanningRun API is not configured" }, { status: 503 });
  }
  return await authorized(request) ? null : Response.json({ error: "Unauthorized" }, { status: 401 });
}

function cleanStrings(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].slice(0, 12);
}

function normalizeBrief(input: BriefInput) {
  const destination = input.destination?.trim() ?? "";
  const days = Number(input.days);
  if (!destination || destination.length > 80) throw new Error("destination must be 1–80 characters");
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("days must be an integer between 1 and 14");
  const candidateMin = Math.max(10, Math.min(40, Number(input.candidate_target?.min ?? 20)));
  const candidateMax = Math.max(candidateMin, Math.min(60, Number(input.candidate_target?.max ?? 40)));
  const dailyStopsMin = Math.max(2, Math.min(6, Number(input.daily_stops?.min ?? 4)));
  const dailyStopsMax = Math.max(dailyStopsMin, Math.min(8, Number(input.daily_stops?.max ?? 6)));
  return {
    destination,
    days,
    interests: cleanStrings(input.interests),
    pace: String(input.pace || "moderate").slice(0, 30),
    source_policy: cleanStrings(input.source_policy).length ? cleanStrings(input.source_policy) : ["official", "xiaohongshu", "osm", "multi_topic_research"],
    candidate_target: { min: candidateMin, max: candidateMax },
    daily_stops: { min: dailyStopsMin, max: dailyStopsMax },
  };
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "PlanningRun tables are unavailable; apply the generated D1 migration first.";
  return message;
}

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
    const brief = normalizeBrief(await request.json() as BriefInput);
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
