import { eq } from "drizzle-orm";
import { compileResearchEvidence } from "../../../../platform/runtime/research.mjs";
import { dataLayer, deny, digest, parseJsonList, routeError } from "../../../../platform/server/planning-runtime";

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function POST(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as { run_id?: string };
    const runId = String(payload.run_id ?? "").trim();
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { candidates, getDb, planningBriefs, planningRunEvents, planningRuns, researchEvidence } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    if (run.currentStage === "shortlisted") {
      const existing = await db.select().from(candidates).where(eq(candidates.runId, runId));
      return Response.json({
        run: { id: runId, current_stage: "shortlisted", provider_poi_calls: run.providerPoiCalls, provider_route_calls: run.providerRouteCalls },
        counts: { shortlisted: existing.length },
        idempotent: true,
      });
    }
    if (run.currentStage !== "researching") {
      return Response.json({ error: `Candidate compilation requires researching stage (current stage: ${run.currentStage})` }, { status: 409 });
    }
    const [briefRow] = await db.select().from(planningBriefs).where(eq(planningBriefs.runId, runId)).limit(1);
    if (!briefRow) return Response.json({ error: "Planning brief not found" }, { status: 409 });
    const evidenceRows = await db.select().from(researchEvidence).where(eq(researchEvidence.runId, runId));
    if (!evidenceRows.length) return Response.json({ error: "Research evidence is required before candidate compilation" }, { status: 422 });
    const brief = JSON.parse(briefRow.briefJson);
    const compiled = compileResearchEvidence({
      brief,
      evidence: evidenceRows,
      minimum: Math.max(20, Math.min(40, run.candidateMin)),
      maximum: Math.max(20, Math.min(40, run.candidateMax)),
    });
    const shortlist = compiled.candidates.filter((candidate: { shortlistRank: number | null }) => candidate.shortlistRank !== null);
    if (!shortlist.length) return Response.json({ error: "Research evidence did not produce any valid place candidates" }, { status: 422 });
    const rows = await Promise.all(shortlist.map(async (candidate: {
      canonicalName: string;
      normalizedName: string;
      aliases: string[];
      themes: string[];
      whyVisit: string;
      watchFor: string[];
      stayMinutes: number;
      riskFlags: string[];
      score: number;
      evidenceCount: number;
      shortlistRank: number;
      userPriority: "must_visit" | "must_eat" | null;
      mustEatMatches: string[];
    }) => ({
      id: `candidate-${(await digest(`${runId}:${candidate.normalizedName}`)).slice(0, 24)}`,
      runId,
      canonicalName: candidate.canonicalName,
      normalizedName: candidate.normalizedName,
      aliasesJson: JSON.stringify(candidate.aliases),
      themesJson: JSON.stringify(candidate.themes),
      whyVisit: candidate.whyVisit,
      watchForJson: JSON.stringify(candidate.watchFor),
      riskFlagsJson: JSON.stringify(candidate.riskFlags),
      stayMinutes: candidate.stayMinutes,
      score: candidate.score,
      evidenceCount: candidate.evidenceCount,
      shortlistRank: candidate.shortlistRank,
      verificationStatus: "candidate",
    })));
    await db.delete(candidates).where(eq(candidates.runId, runId));
    for (const batch of chunks(rows, 7)) await db.insert(candidates).values(batch);
    const now = new Date().toISOString();
    await db.update(planningRuns).set({ currentStage: "shortlisted", status: "running", updatedAt: now }).where(eq(planningRuns.id, runId));
    await db.insert(planningRunEvents).values({
      id: crypto.randomUUID(),
      runId,
      fromStage: "researching",
      toStage: "shortlisted",
      status: "compiled",
      poiCalls: 0,
      routeCalls: 0,
      message: `Compiled ${compiled.counts.evidence} evidence items into ${compiled.counts.deduplicated} names; shortlisted ${compiled.counts.shortlisted}`,
    });
    return Response.json({
      run: { id: runId, current_stage: "shortlisted", provider_poi_calls: run.providerPoiCalls, provider_route_calls: run.providerRouteCalls },
      counts: compiled.counts,
      warnings: compiled.warnings,
      provider_policy: compiled.providerPolicy,
      candidates: rows.map((row) => {
        const compiledCandidate = shortlist.find((candidate: { normalizedName: string }) => candidate.normalizedName === row.normalizedName);
        return {
        id: row.id,
        canonical_name: row.canonicalName,
        aliases: parseJsonList(row.aliasesJson),
        themes: parseJsonList(row.themesJson),
        score: row.score,
        shortlist_rank: row.shortlistRank,
        user_priority: compiledCandidate?.userPriority ?? null,
        matched_must_eat: compiledCandidate?.mustEatMatches ?? [],
        verification_status: row.verificationStatus,
        };
      }),
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
