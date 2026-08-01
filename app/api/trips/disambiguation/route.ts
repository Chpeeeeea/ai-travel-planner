import { and, asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { dataLayer, parseJsonList, routeError } from "../../../../platform/server/planning-runtime";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function clean(value: unknown, maximum = 120) {
  return String(value ?? "").trim().slice(0, maximum);
}

function parseRaw(value: string | null) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to review POI matches" }, { status: 401 });
  try {
    const runId = clean(new URL(request.url).searchParams.get("run_id"), 100);
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { candidates, getDb, planningRuns, providerMatches } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns)
      .where(and(eq(planningRuns.id, runId), eq(planningRuns.ownerUserId, user.userId)))
      .limit(1);
    if (!run) return Response.json({ error: "Travel plan not found" }, { status: 404 });
    const candidateRows = await db.select().from(candidates)
      .where(and(eq(candidates.runId, runId), eq(candidates.verificationStatus, "needs_confirmation")))
      .orderBy(asc(candidates.shortlistRank));
    const items = await Promise.all(candidateRows.map(async (candidate) => {
      const matches = await db.select().from(providerMatches)
        .where(and(eq(providerMatches.candidateId, candidate.id), eq(providerMatches.status, "needs_confirmation")));
      return {
        id: candidate.id,
        canonical_name: candidate.canonicalName,
        aliases: parseJsonList(candidate.aliasesJson),
        themes: parseJsonList(candidate.themesJson),
        why_visit: candidate.whyVisit,
        risk_flags: parseJsonList(candidate.riskFlagsJson),
        matches: matches.map((match) => {
          const detail = parseRaw(match.rawJson);
          return {
            id: match.id,
            name: match.providerName,
            address: match.address,
            type: detail.type ?? "",
            district: detail.district_name ?? "",
            city: detail.city_name ?? "",
            confidence: match.matchConfidence,
            location: match.lng !== null && match.lat !== null ? { lng: match.lng, lat: match.lat, coord_system: match.coordinateSystem } : null,
          };
        }),
      };
    }));
    return Response.json({
      run: { id: run.id, destination: run.destination, current_stage: run.currentStage, status: run.status },
      count: items.length,
      candidates: items,
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to review POI matches" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  try {
    const payload = await request.json() as { run_id?: string; candidate_id?: string; match_id?: string; action?: "confirm" | "reject" };
    const runId = clean(payload.run_id, 100);
    const candidateId = clean(payload.candidate_id, 100);
    const action = payload.action;
    if (!runId || !candidateId || !["confirm", "reject"].includes(String(action))) {
      return Response.json({ error: "run_id, candidate_id and action are required" }, { status: 400 });
    }
    const { candidates, getDb, planningRunEvents, planningRuns, providerMatches } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns)
      .where(and(eq(planningRuns.id, runId), eq(planningRuns.ownerUserId, user.userId)))
      .limit(1);
    const [candidate] = await db.select().from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.runId, runId)))
      .limit(1);
    if (!run || !candidate) return Response.json({ error: "Travel plan or candidate not found" }, { status: 404 });
    if (run.currentStage !== "verifying" || candidate.verificationStatus !== "needs_confirmation") {
      return Response.json({ error: "This POI no longer requires confirmation" }, { status: 409 });
    }
    const matches = await db.select().from(providerMatches).where(eq(providerMatches.candidateId, candidateId));
    const now = new Date().toISOString();
    let candidateOperation;
    let matchOperations;
    if (action === "confirm") {
      const matchId = clean(payload.match_id, 120);
      const selected = matches.find((match) => match.id === matchId && match.status === "needs_confirmation");
      if (!selected?.providerPoiId || selected.lng === null || selected.lat === null) {
        return Response.json({ error: "Select a confirmable AMap match with coordinates" }, { status: 422 });
      }
      matchOperations = matches.map((match) => db.update(providerMatches).set({
        status: match.id === selected.id ? "verified" : "rejected",
        verifiedAt: match.id === selected.id ? now : null,
      }).where(eq(providerMatches.id, match.id)));
      candidateOperation = db.update(candidates).set({ verificationStatus: "verified", updatedAt: now }).where(eq(candidates.id, candidateId));
    } else {
      matchOperations = matches.map((match) => db.update(providerMatches).set({ status: "rejected", verifiedAt: null }).where(eq(providerMatches.id, match.id)));
      candidateOperation = db.update(candidates).set({ verificationStatus: "rejected", updatedAt: now }).where(eq(candidates.id, candidateId));
    }
    const ambiguous = await db.select({ id: candidates.id }).from(candidates)
      .where(and(eq(candidates.runId, runId), eq(candidates.verificationStatus, "needs_confirmation")));
    const remaining = ambiguous.filter((item) => item.id !== candidateId).length;
    const runOperation = db.update(planningRuns).set({
      status: remaining ? "awaiting_confirmation" : "queued",
      lastError: remaining ? `${remaining} 个地点仍需人工确认` : null,
      updatedAt: now,
    }).where(eq(planningRuns.id, runId));
    const eventOperation = db.insert(planningRunEvents).values({
      id: crypto.randomUUID(), runId, fromStage: "verifying", toStage: "verifying",
      status: action === "confirm" ? "traveler_provider_match_confirmed" : "traveler_candidate_rejected",
      poiCalls: 0, routeCalls: 0,
      message: `${candidate.canonicalName}: ${action === "confirm" ? "traveler selected AMap match" : "traveler rejected candidate"}`,
      createdAt: now,
    });
    await db.batch([candidateOperation, ...matchOperations, runOperation, eventOperation]);
    return Response.json({
      candidate_id: candidateId,
      verification_status: action === "confirm" ? "verified" : "rejected",
      remaining,
      run_status: remaining ? "awaiting_confirmation" : "queued",
      provider_calls: 0,
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
