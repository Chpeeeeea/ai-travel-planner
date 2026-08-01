import { desc, eq } from "drizzle-orm";
import { candidateConstraintFit, normalizePlaceName } from "../../../../platform/runtime/research.mjs";
import { dataLayer, deny, parseJsonList, routeError } from "../../../../platform/server/planning-runtime";

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const runId = new URL(request.url).searchParams.get("run_id") ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { candidates, getDb, planningBriefs, planningRuns, researchEvidence } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const [candidateRows, evidenceRows, briefRows] = await Promise.all([
      db.select().from(candidates).where(eq(candidates.runId, runId)).orderBy(desc(candidates.score)),
      db.select().from(researchEvidence).where(eq(researchEvidence.runId, runId)),
      db.select().from(planningBriefs).where(eq(planningBriefs.runId, runId)).limit(1),
    ]);
    const brief = briefRows[0] ? JSON.parse(briefRows[0].briefJson) : {};
    const review = candidateRows
      .sort((left, right) => (left.shortlistRank ?? 999) - (right.shortlistRank ?? 999) || right.score - left.score)
      .map((candidate) => {
        const nameKeys = new Set([
          candidate.normalizedName,
          ...parseJsonList(candidate.aliasesJson).map((name) => normalizePlaceName(name)),
        ]);
        const matchingEvidence = evidenceRows.filter((evidence) => {
          if (nameKeys.has(evidence.normalizedName)) return true;
          return parseJsonList(evidence.aliasesJson).some((alias) => nameKeys.has(normalizePlaceName(alias)));
        });
        const sourceKeys = new Set<string>();
        const sources = matchingEvidence.flatMap((evidence) => {
          const key = `${evidence.sourceKind}|${evidence.sourceUrl}|${evidence.sourceTitle}`;
          if (sourceKeys.has(key)) return [];
          sourceKeys.add(key);
          return [{ kind: evidence.sourceKind, title: evidence.sourceTitle, url: evidence.sourceUrl, authority: evidence.sourceAuthority }];
        });
        const constraintFit = candidateConstraintFit({
          canonicalName: candidate.canonicalName,
          aliases: parseJsonList(candidate.aliasesJson),
          whyVisit: candidate.whyVisit,
          watchFor: parseJsonList(candidate.watchForJson),
        }, brief);
        return {
          id: candidate.id,
          canonical_name: candidate.canonicalName,
          aliases: parseJsonList(candidate.aliasesJson),
          themes: parseJsonList(candidate.themesJson),
          why_visit: candidate.whyVisit,
          watch_for: parseJsonList(candidate.watchForJson),
          stay_minutes: candidate.stayMinutes,
          risk_flags: parseJsonList(candidate.riskFlagsJson),
          score: candidate.score,
          evidence_count: candidate.evidenceCount,
          shortlist_rank: candidate.shortlistRank,
          user_priority: constraintFit.mustVisitMatch ? "must_visit" : constraintFit.mustEatMatches.length ? "must_eat" : null,
          matched_must_eat: constraintFit.mustEatMatches,
          sent_to_amap: candidate.shortlistRank !== null,
          verification_status: candidate.verificationStatus,
          sources,
        };
      });
    return Response.json({
      run: {
        id: run.id,
        destination: run.destination,
        current_stage: run.currentStage,
        provider_poi_calls: run.providerPoiCalls,
        provider_route_calls: run.providerRouteCalls,
      },
      counts: { evidence: evidenceRows.length, shortlisted: review.filter((candidate) => candidate.sent_to_amap).length },
      provider_policy: "This review contains name-level candidates only; AMap verification has not run.",
      candidates: review,
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
