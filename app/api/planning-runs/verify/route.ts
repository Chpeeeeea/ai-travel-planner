import { and, asc, eq } from "drizzle-orm";
import { chooseAmapMatch } from "../../../../platform/runtime/provider.mjs";
import { AmapProviderError, amapWebServiceKey, searchAmapPlaces } from "../../../../platform/server/amap-provider";
import { canceledRunResponse, dataLayer, deny, digest, parseJsonList, routeError } from "../../../../platform/server/planning-runtime";
import { providerAllowance, recordProviderUsage } from "../../../../platform/server/traveler-quota";

function clean(value: unknown, maximum = 120) {
  return String(value ?? "").trim().slice(0, maximum);
}

function parseRaw(value: string | null) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const runId = new URL(request.url).searchParams.get("run_id") ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { candidates, getDb, planningRuns, providerMatches } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const [candidateRows, matchRows] = await Promise.all([
      db.select().from(candidates).where(eq(candidates.runId, runId)).orderBy(asc(candidates.shortlistRank)),
      db.select().from(providerMatches).where(eq(providerMatches.runId, runId)),
    ]);
    return Response.json({
      run: { id: run.id, current_stage: run.currentStage, provider_poi_calls: run.providerPoiCalls },
      counts: {
        total: candidateRows.length,
        verified: candidateRows.filter((item) => item.verificationStatus === "verified").length,
        needs_confirmation: candidateRows.filter((item) => item.verificationStatus === "needs_confirmation").length,
        pending: candidateRows.filter((item) => ["candidate", "verification_failed"].includes(item.verificationStatus)).length,
      },
      candidates: candidateRows.map((candidate) => ({
        id: candidate.id,
        canonical_name: candidate.canonicalName,
        aliases: parseJsonList(candidate.aliasesJson),
        verification_status: candidate.verificationStatus,
        matches: matchRows.filter((match) => match.candidateId === candidate.id).map((match) => ({
          id: match.id,
          provider_poi_id: match.providerPoiId,
          name: match.providerName,
          address: match.address,
          typecode: match.typecode,
          location: match.lng !== null && match.lat !== null ? { lng: match.lng, lat: match.lat, coord_system: match.coordinateSystem } : null,
          confidence: match.matchConfidence,
          status: match.status,
          verified_at: match.verifiedAt,
          provider_detail: parseRaw(match.rawJson),
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
    const payload = await request.json() as { run_id?: string; limit?: number; retry_failed?: boolean };
    const runId = clean(payload.run_id, 100);
    const limit = Math.max(1, Math.min(5, Math.floor(Number(payload.limit) || 5)));
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { candidates, getDb, planningRunEvents, planningRuns, providerMatches } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const canceled = canceledRunResponse(run);
    if (canceled) return canceled;
    if (!["shortlisted", "verifying"].includes(run.currentStage)) {
      return Response.json({ error: `POI verification requires shortlisted or verifying stage (current stage: ${run.currentStage})` }, { status: 409 });
    }
    const allCandidates = await db.select().from(candidates).where(eq(candidates.runId, runId)).orderBy(asc(candidates.shortlistRank));
    const pendingCandidates = allCandidates.filter((item) => ["candidate", "verification_failed"].includes(item.verificationStatus)).length;
    const allowance = await providerAllowance(run.ownerUserId, "poi", limit);
    if (!allowance.allowed) {
      return Response.json({
        run: { id: runId, current_stage: "verifying", provider_poi_calls: run.providerPoiCalls },
        processed: 0,
        remaining: pendingCandidates,
        attempted_provider_calls: 0,
        quota_exceeded: true,
        stopped_early: true,
        quota: allowance.quota,
      });
    }
    try { await amapWebServiceKey(); }
    catch (error) {
      if (error instanceof AmapProviderError && error.code === "MISSING_KEY") {
        return Response.json({ error: error.message, required_secret: "AMAP_WEBSERVICE_KEY" }, { status: 503 });
      }
      throw error;
    }
    const eligibleStatuses = payload.retry_failed ? new Set(["candidate", "verification_failed"]) : new Set(["candidate"]);
    const batch = allCandidates.filter((item) => eligibleStatuses.has(item.verificationStatus)).slice(0, allowance.allowed);
    if (!batch.length) {
      return Response.json({
        run: { id: runId, current_stage: "verifying", provider_poi_calls: run.providerPoiCalls },
        processed: 0,
        remaining: allCandidates.filter((item) => ["candidate", "verification_failed"].includes(item.verificationStatus)).length,
        idempotent: true,
      });
    }

    let calls = 0;
    let lastError = "";
    let stop = false;
    const results = [];
    for (const candidate of batch) {
      if (stop) break;
      calls += 1;
      try {
        const response = await searchAmapPlaces(candidate.canonicalName, run.destination);
        const decision = chooseAmapMatch({
          canonicalName: candidate.canonicalName,
          aliases: parseJsonList(candidate.aliasesJson),
          themes: parseJsonList(candidate.themesJson),
        }, response.pois, run.destination);
        await db.delete(providerMatches).where(eq(providerMatches.candidateId, candidate.id));
        let status = decision.status;
        const rows = [];
        for (const match of decision.matches) {
          const [duplicate] = await db.select().from(providerMatches).where(and(
            eq(providerMatches.runId, runId),
            eq(providerMatches.provider, "amap"),
            eq(providerMatches.providerPoiId, match.providerPoiId),
          )).limit(1);
          if (duplicate && duplicate.candidateId !== candidate.id) {
            if (decision.selected?.providerPoiId === match.providerPoiId) status = "needs_confirmation";
            continue;
          }
          const selected = status === "verified" && decision.selected?.providerPoiId === match.providerPoiId;
          rows.push({
            id: `match-${(await digest(`${runId}:${candidate.id}:${match.providerPoiId}`)).slice(0, 28)}`,
            runId,
            candidateId: candidate.id,
            provider: "amap",
            providerPoiId: match.providerPoiId,
            providerName: match.name,
            address: match.address,
            typecode: match.typecode,
            lng: match.location?.lng ?? null,
            lat: match.location?.lat ?? null,
            coordinateSystem: match.location ? "GCJ-02" : null,
            matchConfidence: match.confidence,
            status: selected ? "verified" : status === "needs_confirmation" ? "needs_confirmation" : "rejected",
            rawJson: JSON.stringify({
              province_name: match.provinceName,
              city_name: match.cityName,
              district_name: match.districtName,
              province_code: match.provinceCode,
              city_code: match.cityCode,
              adcode: match.adcode,
              type: match.type,
              aliases: match.aliases,
              business: match.business,
              confidence_margin: decision.margin,
            }),
            verifiedAt: selected ? new Date().toISOString() : null,
          });
        }
        if (rows.length) await db.insert(providerMatches).values(rows);
        if (status === "verified" && !rows.some((row) => row.status === "verified")) status = "needs_confirmation";
        await db.update(candidates).set({ verificationStatus: status, updatedAt: new Date().toISOString() }).where(eq(candidates.id, candidate.id));
        results.push({ candidate_id: candidate.id, canonical_name: candidate.canonicalName, status, matches: rows.length, confidence_margin: decision.margin });
      } catch (error) {
        const providerError = error instanceof AmapProviderError ? error : new AmapProviderError(routeError(error));
        lastError = `${providerError.code}: ${providerError.message}`;
        await db.update(candidates).set({ verificationStatus: "verification_failed", updatedAt: new Date().toISOString() }).where(eq(candidates.id, candidate.id));
        results.push({ candidate_id: candidate.id, canonical_name: candidate.canonicalName, status: "verification_failed", error_code: providerError.code });
        if (providerError.fatal || providerError.retryable) stop = true;
      }
    }
    const refreshed = await db.select().from(candidates).where(eq(candidates.runId, runId));
    const remaining = refreshed.filter((item) => ["candidate", "verification_failed"].includes(item.verificationStatus)).length;
    const now = new Date().toISOString();
    await recordProviderUsage(run.ownerUserId, runId, "poi", calls, now);
    const [latestRun] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (latestRun?.status === "canceled") {
      await db.batch([
        db.update(planningRuns).set({ providerPoiCalls: latestRun.providerPoiCalls + calls, updatedAt: now }).where(eq(planningRuns.id, runId)),
        db.insert(planningRunEvents).values({
          id: crypto.randomUUID(), runId, fromStage: latestRun.currentStage, toStage: latestRun.currentStage,
          status: "canceled_after_provider_batch", poiCalls: calls, routeCalls: 0,
          message: `Cancellation arrived during a POI batch; recorded ${calls} completed provider calls and stopped further work`, createdAt: now,
        }),
      ]);
      return Response.json({ error: "PlanningRun was canceled by the traveler", code: "RUN_CANCELED", attempted_provider_calls: calls }, { status: 409 });
    }
    await db.update(planningRuns).set({
      currentStage: "verifying",
      status: lastError ? "running_with_warnings" : "running",
      providerPoiCalls: run.providerPoiCalls + calls,
      lastError: lastError || null,
      updatedAt: now,
    }).where(eq(planningRuns.id, runId));
    await db.insert(planningRunEvents).values({
      id: crypto.randomUUID(), runId, fromStage: run.currentStage, toStage: "verifying",
      status: lastError ? "verification_batch_warning" : "verification_batch_complete",
      poiCalls: calls, routeCalls: 0,
      message: `Processed ${results.length} shortlist candidates; ${remaining} candidates remain`,
    });
    return Response.json({
      run: { id: runId, current_stage: "verifying", provider_poi_calls: run.providerPoiCalls + calls },
      processed: results.length,
      attempted_provider_calls: calls,
      remaining,
      stopped_early: stop,
      quota: allowance.quota,
      results,
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
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
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    const [candidate] = await db.select().from(candidates).where(and(eq(candidates.id, candidateId), eq(candidates.runId, runId))).limit(1);
    if (!run || !candidate) return Response.json({ error: "PlanningRun or candidate not found" }, { status: 404 });
    const canceled = canceledRunResponse(run);
    if (canceled) return canceled;
    if (run.currentStage !== "verifying") return Response.json({ error: "POI decisions require verifying stage" }, { status: 409 });
    if (action === "reject") {
      await db.update(candidates).set({ verificationStatus: "rejected", updatedAt: new Date().toISOString() }).where(eq(candidates.id, candidateId));
      const matches = await db.select().from(providerMatches).where(eq(providerMatches.candidateId, candidateId));
      for (const match of matches) await db.update(providerMatches).set({ status: "rejected", verifiedAt: null }).where(eq(providerMatches.id, match.id));
    } else {
      const matchId = clean(payload.match_id, 120);
      const [selected] = await db.select().from(providerMatches).where(and(eq(providerMatches.id, matchId), eq(providerMatches.candidateId, candidateId))).limit(1);
      if (!selected?.providerPoiId || selected.lng === null || selected.lat === null) {
        return Response.json({ error: "A confirmable provider match with ID and coordinates is required" }, { status: 422 });
      }
      const matches = await db.select().from(providerMatches).where(eq(providerMatches.candidateId, candidateId));
      const now = new Date().toISOString();
      for (const match of matches) await db.update(providerMatches).set({ status: match.id === matchId ? "verified" : "rejected", verifiedAt: match.id === matchId ? now : null }).where(eq(providerMatches.id, match.id));
      await db.update(candidates).set({ verificationStatus: "verified", updatedAt: now }).where(eq(candidates.id, candidateId));
    }
    await db.insert(planningRunEvents).values({
      id: crypto.randomUUID(), runId, fromStage: "verifying", toStage: "verifying",
      status: action === "confirm" ? "provider_match_confirmed" : "candidate_rejected",
      poiCalls: 0, routeCalls: 0, message: `${candidate.canonicalName}: ${action}`,
    });
    return Response.json({ candidate_id: candidateId, verification_status: action === "confirm" ? "verified" : "rejected", provider_calls: 0 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
