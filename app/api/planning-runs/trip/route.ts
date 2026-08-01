import { asc, eq } from "drizzle-orm";
import { dataLayer, deny, parseJsonList, routeError } from "../../../../platform/server/planning-runtime";

function parse(value: string | null | undefined, fallback: unknown = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function mapView(points: Array<{ lng: number; lat: number }>) {
  if (!points.length) return null;
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const minimumLng = Math.min(...lngs);
  const maximumLng = Math.max(...lngs);
  const minimumLat = Math.min(...lats);
  const maximumLat = Math.max(...lats);
  const lngPadding = Math.max(0.01, (maximumLng - minimumLng) * 0.12);
  const latPadding = Math.max(0.01, (maximumLat - minimumLat) * 0.12);
  return {
    center: { lng: (minimumLng + maximumLng) / 2, lat: (minimumLat + maximumLat) / 2 },
    zoom: points.length === 1 ? 15 : 11,
    bounds: {
      southwest: { lng: minimumLng - lngPadding, lat: minimumLat - latPadding },
      northeast: { lng: maximumLng + lngPadding, lat: maximumLat + latPadding },
    },
  };
}

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const runId = new URL(request.url).searchParams.get("run_id") ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { assignments, candidates, getDb, itineraryDays, planningBriefs, planningRuns, providerMatches, researchEvidence, routeSegments } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const [briefRow, candidateRows, matchRows, dayRows, evidenceRows] = await Promise.all([
      db.select().from(planningBriefs).where(eq(planningBriefs.runId, runId)).limit(1).then((items) => items[0]),
      db.select().from(candidates).where(eq(candidates.runId, runId)).orderBy(asc(candidates.shortlistRank)),
      db.select().from(providerMatches).where(eq(providerMatches.runId, runId)),
      db.select().from(itineraryDays).where(eq(itineraryDays.runId, runId)).orderBy(asc(itineraryDays.dayNumber)),
      db.select().from(researchEvidence).where(eq(researchEvidence.runId, runId)),
    ]);
    const assignmentRows = (await Promise.all(dayRows.map((day) =>
      db.select().from(assignments).where(eq(assignments.dayId, day.id)).orderBy(asc(assignments.orderIndex))))).flat();
    const segmentRows = (await Promise.all(dayRows.map((day) =>
      db.select().from(routeSegments).where(eq(routeSegments.dayId, day.id))))).flat();
    const brief = briefRow ? JSON.parse(briefRow.briefJson) : {};
    const verifiedByCandidate = new Map(matchRows.filter((item) => item.status === "verified").map((item) => [item.candidateId, item]));
    const points = [...verifiedByCandidate.values()]
      .filter((item) => item.lng !== null && item.lat !== null)
      .map((item) => ({ lng: item.lng!, lat: item.lat! }));
    const assignmentById = new Map(assignmentRows.map((item) => [item.id, item]));
    const assignedCandidateIds = new Set(assignmentRows.map((item) => item.candidateId));
    const pois = candidateRows.map((candidate) => {
      const match = verifiedByCandidate.get(candidate.id);
      const detail = parse(match?.rawJson, {}) as Record<string, unknown>;
      const business = (detail.business ?? {}) as Record<string, unknown>;
      return {
        id: candidate.id,
        provider: match ? "amap" : null,
        provider_poi_id: match?.providerPoiId ?? null,
        name: candidate.canonicalName,
        aliases: parseJsonList(candidate.aliasesJson),
        address: match?.address ?? "",
        adcode: String(detail.adcode ?? ""),
        typecode: match?.typecode ?? "",
        location: match?.lng !== null && match?.lng !== undefined && match?.lat !== null && match?.lat !== undefined
          ? { lng: match.lng, lat: match.lat, coord_system: "GCJ-02" }
          : null,
        themes: parseJsonList(candidate.themesJson),
        business: {
          rating: business.rating ?? null,
          cost: business.cost ?? null,
          open_hours: business.openWeek ?? business.openToday ?? null,
        },
        content: {
          why_visit: candidate.whyVisit,
          watch_for: parseJsonList(candidate.watchForJson),
          stay_minutes: candidate.stayMinutes,
        },
        verification: {
          status: candidate.verificationStatus,
          verified_at: match?.verifiedAt ?? null,
          match_confidence: match?.matchConfidence ?? null,
        },
        assignment_status: assignedCandidateIds.has(candidate.id) ? "scheduled" : "candidate",
      };
    });
    const days = dayRows.map((day) => {
      const dayAssignments = assignmentRows.filter((item) => item.dayId === day.id);
      const daySegments = segmentRows.filter((item) => item.dayId === day.id);
      return {
        id: day.id,
        day_number: day.dayNumber,
        title: day.title,
        window: { start: day.windowStart, end: day.windowEnd },
        assignments: dayAssignments.map((item) => ({
          poi_id: item.candidateId,
          order_index: item.orderIndex,
          arrival_time: item.arrivalTime,
          departure_time: item.departureTime,
          locked: item.locked,
          notes: item.notes,
        })),
        route_segments: daySegments.map((segment) => ({
          from_poi_id: assignmentById.get(segment.fromAssignmentId)?.candidateId ?? null,
          to_poi_id: assignmentById.get(segment.toAssignmentId)?.candidateId ?? null,
          mode: segment.mode,
          provider: segment.provider,
          distance_m: segment.distanceM,
          duration_s: segment.durationS,
          geometry: parse(segment.geometryJson, []),
          status: segment.status,
          verified_at: segment.verifiedAt,
        })),
      };
    });
    const unverifiedCount = candidateRows.filter((item) => item.verificationStatus !== "verified").length;
    const pendingRouteCount = segmentRows.filter((item) => item.status === "pending").length;
    const fallbackCount = segmentRows.filter((item) => item.status === "fallback_straight_line").length;
    const warnings = [
      ...(unverifiedCount ? [`${unverifiedCount} 个候选地点未通过高德核验`] : []),
      ...(pendingRouteCount ? [`${pendingRouteCount} 段相邻道路尚待计算`] : []),
      ...(fallbackCount ? [`${fallbackCount} 段道路暂用端点连线，不含虚构耗时`] : []),
    ];
    return Response.json({
      schema_version: "1.0",
      planning_run: { id: run.id, current_stage: run.currentStage, status: run.status, provider_poi_calls: run.providerPoiCalls, provider_route_calls: run.providerRouteCalls },
      trip: {
        id: run.id,
        title: `${run.destination}${run.days}日旅行`,
        city: run.destination,
        timezone: "Asia/Shanghai",
        coordinate_system: "GCJ-02",
        default_mode: brief.transport_mode ?? "mixed",
        daily_window: brief.daily_window ?? { start: "09:00", end: "18:00" },
        assumptions: ["只使用已核验地点排程", "只计算同一天相邻地点的真实道路"],
        map_view: mapView(points),
      },
      pois,
      days,
      provenance: {
        research_source_count: evidenceRows.length,
        research_source_kinds: [...new Set(evidenceRows.map((item) => item.sourceKind))],
        poi_provider: "amap-webservice-v5",
        route_provider: segmentRows.some((item) => item.provider) ? "amap-webservice-v5" : null,
        updated_at: run.updatedAt,
      },
      quality: {
        status: run.currentStage === "published" && !warnings.length ? "verified" : warnings.length ? "needs_input" : "draft",
        warnings,
        unverified_poi_count: unverifiedCount,
        verified_poi_count: candidateRows.length - unverifiedCount,
        pending_route_count: pendingRouteCount,
        verified_route_count: segmentRows.filter((item) => item.status === "verified").length,
      },
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
