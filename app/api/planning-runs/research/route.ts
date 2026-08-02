import { desc, eq, sql } from "drizzle-orm";
import { SOURCE_WEIGHT, normalizePlaceName, uniqueStrings } from "../../../../platform/runtime/research.mjs";
import { canceledRunResponse, dataLayer, deny, digest, parseJsonList, routeError } from "../../../../platform/server/planning-runtime";

type EvidenceInput = {
  lane?: string;
  place_name?: string;
  aliases?: unknown[];
  themes?: unknown[];
  why_visit?: string;
  watch_for?: unknown[];
  stay_minutes?: number;
  risk_flags?: unknown[];
  source?: { kind?: string; title?: string; url?: string; authority?: number };
};

const sourceKinds = new Set(Object.keys(SOURCE_WEIGHT));

function text(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function stringList(value: unknown, maximum: number, itemMaximum = 120) {
  return uniqueStrings(Array.isArray(value) ? value.map((item) => text(item, itemMaximum)) : [], maximum);
}

function sourceUrl(value: unknown) {
  const raw = text(value, 1000);
  if (!raw) return "";
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("source.url must use http or https");
  return parsed.toString();
}

function normalizeEvidence(input: EvidenceInput) {
  const lane = text(input.lane || "other", 30).toLowerCase();
  const placeName = text(input.place_name, 120);
  if (!/^[a-z][a-z0-9_-]{0,29}$/.test(lane)) throw new Error("lane must be a lowercase research lane slug");
  if (!placeName) throw new Error("place_name is required");
  const normalizedName = normalizePlaceName(placeName);
  if (!normalizedName) throw new Error("place_name must contain searchable characters");
  const kind = text(input.source?.kind || "other", 30).toLowerCase();
  if (!sourceKinds.has(kind)) throw new Error(`unsupported source kind: ${kind}`);
  const explicitAuthority = Number(input.source?.authority);
  const authority = Number.isFinite(explicitAuthority)
    ? Math.max(0, Math.min(1, explicitAuthority))
    : SOURCE_WEIGHT[kind as keyof typeof SOURCE_WEIGHT];
  return {
    lane,
    placeName,
    normalizedName,
    aliases: stringList(input.aliases, 12),
    themes: stringList(input.themes, 8, 40),
    whyVisit: text(input.why_visit, 800),
    watchFor: stringList(input.watch_for, 12, 160),
    stayMinutes: Math.max(20, Math.min(360, Math.round(Number(input.stay_minutes) || 60))),
    riskFlags: stringList(input.risk_flags, 10, 160),
    sourceKind: kind,
    sourceTitle: text(input.source?.title, 240),
    sourceUrl: sourceUrl(input.source?.url),
    sourceAuthority: authority,
  };
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("run_id") ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 100));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const { getDb, planningRuns, researchEvidence } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const [countRow] = await db.select({ value: sql<number>`count(*)` }).from(researchEvidence).where(eq(researchEvidence.runId, runId));
    const rows = await db.select().from(researchEvidence)
      .where(eq(researchEvidence.runId, runId))
      .orderBy(desc(researchEvidence.createdAt))
      .limit(limit)
      .offset(offset);
    return Response.json({
      run: { id: run.id, current_stage: run.currentStage, provider_poi_calls: run.providerPoiCalls, provider_route_calls: run.providerRouteCalls },
      total: Number(countRow?.value ?? 0),
      limit,
      offset,
      evidence: rows.map((row) => ({
        id: row.id,
        lane: row.lane,
        place_name: row.placeName,
        aliases: parseJsonList(row.aliasesJson),
        themes: parseJsonList(row.themesJson),
        why_visit: row.whyVisit,
        watch_for: parseJsonList(row.watchForJson),
        stay_minutes: row.stayMinutes,
        risk_flags: parseJsonList(row.riskFlagsJson),
        source: { kind: row.sourceKind, title: row.sourceTitle, url: row.sourceUrl, authority: row.sourceAuthority },
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
    const payload = await request.json() as { run_id?: string; evidence?: EvidenceInput[] };
    const runId = text(payload.run_id, 100);
    if (!runId || !Array.isArray(payload.evidence) || !payload.evidence.length) {
      return Response.json({ error: "run_id and a non-empty evidence array are required" }, { status: 400 });
    }
    if (payload.evidence.length > 100) {
      return Response.json({ error: "evidence batches are limited to 100 items" }, { status: 400 });
    }
    const normalized = payload.evidence.map(normalizeEvidence);
    const rows = await Promise.all(normalized.map(async (item) => ({
      id: `evidence-${(await digest([runId, item.lane, item.normalizedName, item.sourceKind, item.sourceUrl, item.sourceTitle].join("|"))).slice(0, 32)}`,
      runId,
      lane: item.lane,
      placeName: item.placeName,
      normalizedName: item.normalizedName,
      aliasesJson: JSON.stringify(item.aliases),
      themesJson: JSON.stringify(item.themes),
      whyVisit: item.whyVisit,
      watchForJson: JSON.stringify(item.watchFor),
      stayMinutes: item.stayMinutes,
      riskFlagsJson: JSON.stringify(item.riskFlags),
      sourceKind: item.sourceKind,
      sourceTitle: item.sourceTitle,
      sourceUrl: item.sourceUrl,
      sourceAuthority: item.sourceAuthority,
    })));
    const { getDb, planningRunEvents, planningRuns, researchEvidence } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const canceled = canceledRunResponse(run);
    if (canceled) return canceled;
    if (run.currentStage !== "brief" && run.currentStage !== "researching") {
      return Response.json({ error: `Research evidence is locked after shortlist compilation (current stage: ${run.currentStage})` }, { status: 409 });
    }
    for (const batch of chunks(rows, 6)) {
      await db.insert(researchEvidence).values(batch).onConflictDoUpdate({
        target: researchEvidence.id,
        set: {
          lane: sql`excluded.lane`,
          placeName: sql`excluded.place_name`,
          normalizedName: sql`excluded.normalized_name`,
          aliasesJson: sql`excluded.aliases_json`,
          themesJson: sql`excluded.themes_json`,
          whyVisit: sql`excluded.why_visit`,
          watchForJson: sql`excluded.watch_for_json`,
          stayMinutes: sql`excluded.stay_minutes`,
          riskFlagsJson: sql`excluded.risk_flags_json`,
          sourceKind: sql`excluded.source_kind`,
          sourceTitle: sql`excluded.source_title`,
          sourceUrl: sql`excluded.source_url`,
          sourceAuthority: sql`excluded.source_authority`,
        },
      });
    }
    const now = new Date().toISOString();
    await db.update(planningRuns).set({ currentStage: "researching", status: "running", updatedAt: now }).where(eq(planningRuns.id, runId));
    await db.insert(planningRunEvents).values({
      id: crypto.randomUUID(),
      runId,
      fromStage: run.currentStage,
      toStage: "researching",
      status: "evidence_ingested",
      message: `Ingested ${rows.length} provider-free research evidence items`,
      poiCalls: 0,
      routeCalls: 0,
    });
    const [countRow] = await db.select({ value: sql<number>`count(*)` }).from(researchEvidence).where(eq(researchEvidence.runId, runId));
    return Response.json({
      run: { id: runId, current_stage: "researching", provider_poi_calls: run.providerPoiCalls, provider_route_calls: run.providerRouteCalls },
      ingested: rows.length,
      evidence_total: Number(countRow?.value ?? 0),
      provider_policy: "Research evidence ingestion performs zero AMap calls",
    }, { status: run.currentStage === "brief" ? 201 : 200 });
  } catch (error) {
    const message = routeError(error);
    return Response.json({ error: message }, { status: /required|unsupported|must use|lane must/.test(message) ? 400 : 500 });
  }
}
