function parse(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function jsonList(value) {
  const parsed = parse(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function nullableNumber(value) {
  const number = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(number) ? null : number;
}

export function tripMapView(points) {
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

/** @param {Record<string, any>} input */
export function buildTripDocument(input) {
  const { run, brief = {}, candidates = [], matches = [], days = [], assignments = [], segments = [], evidence = [] } = input;
  const verifiedByCandidate = new Map(matches.filter((item) => item.status === "verified").map((item) => [item.candidateId, item]));
  const points = [...verifiedByCandidate.values()]
    .filter((item) => item.lng !== null && item.lat !== null)
    .map((item) => ({ lng: item.lng, lat: item.lat }));
  const assignmentById = new Map(assignments.map((item) => [item.id, item]));
  const assignedCandidateIds = new Set(assignments.map((item) => item.candidateId));
  const pois = candidates.map((candidate) => {
    const match = verifiedByCandidate.get(candidate.id);
    const detail = parse(match?.rawJson, {});
    const business = detail && typeof detail === "object" && detail.business && typeof detail.business === "object" ? detail.business : {};
    return {
      id: candidate.id,
      provider: match ? "amap" : null,
      provider_poi_id: match?.providerPoiId ?? null,
      name: candidate.canonicalName,
      aliases: jsonList(candidate.aliasesJson),
      address: match?.address ?? "",
      adcode: String(detail?.adcode ?? ""),
      typecode: match?.typecode ?? "",
      location: match?.lng !== null && match?.lng !== undefined && match?.lat !== null && match?.lat !== undefined
        ? { lng: match.lng, lat: match.lat, coord_system: "GCJ-02" }
        : null,
      themes: jsonList(candidate.themesJson),
      business: {
        rating: nullableNumber(business.rating),
        cost: nullableNumber(business.cost),
        open_hours: business.openWeek ?? business.openToday ?? null,
      },
      content: {
        why_visit: candidate.whyVisit,
        watch_for: jsonList(candidate.watchForJson),
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
  const tripDays = days.map((day) => {
    const dayAssignments = assignments.filter((item) => item.dayId === day.id);
    const daySegments = segments.filter((item) => item.dayId === day.id);
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
  const unverifiedCount = candidates.filter((item) => item.verificationStatus !== "verified").length;
  const pendingRouteCount = segments.filter((item) => item.status === "pending").length;
  const fallbackCount = segments.filter((item) => item.status === "fallback_straight_line").length;
  const warnings = [
    ...(unverifiedCount ? [`${unverifiedCount} 个候选地点未通过高德核验`] : []),
    ...(pendingRouteCount ? [`${pendingRouteCount} 段相邻道路尚待计算`] : []),
    ...(fallbackCount ? [`${fallbackCount} 段道路暂用端点连线，不含虚构耗时`] : []),
  ];
  return {
    schema_version: "1.0",
    planning_run: {
      id: run.id,
      current_stage: run.currentStage,
      status: run.status,
      provider_poi_calls: run.providerPoiCalls,
      provider_route_calls: run.providerRouteCalls,
    },
    trip: {
      id: run.id,
      title: `${run.destination}${run.days}日旅行`,
      city: run.destination,
      timezone: "Asia/Shanghai",
      coordinate_system: "GCJ-02",
      default_mode: brief.transport_mode ?? "mixed",
      daily_window: brief.daily_window ?? { start: "09:00", end: "18:00" },
      assumptions: ["只使用已核验地点排程", "只计算同一天相邻地点的真实道路"],
      map_view: tripMapView(points),
    },
    pois,
    days: tripDays,
    provenance: {
      research_source_count: evidence.length,
      research_source_kinds: [...new Set(evidence.map((item) => item.sourceKind))],
      poi_provider: "amap-webservice-v5",
      route_provider: segments.some((item) => item.provider) ? "amap-webservice-v5" : null,
      updated_at: run.updatedAt,
    },
    quality: {
      status: run.currentStage === "published" && !warnings.length ? "verified" : warnings.length ? "needs_input" : "draft",
      warnings,
      unverified_poi_count: unverifiedCount,
      verified_poi_count: candidates.length - unverifiedCount,
      pending_route_count: pendingRouteCount,
      verified_route_count: segments.filter((item) => item.status === "verified").length,
    },
  };
}

function routeDistance(value) {
  if (value === null || value === undefined) return "距离待核验";
  return value < 1000 ? `${Math.round(value)} 米` : `${(value / 1000).toFixed(1)} 公里`;
}

function routeDuration(value) {
  if (value === null || value === undefined) return "时间待核验";
  const minutes = Math.round(value / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}

/** @param {Record<string, any>} trip */
export function tripToMarkdown(trip) {
  const poiById = new Map(trip.pois.map((poi) => [poi.id, poi]));
  const lines = [
    `# ${trip.trip.title}`,
    "",
    `> ${trip.trip.city} · ${trip.days.length} 天 · ${trip.quality.verified_poi_count ?? 0} 个已核验地点 · ${trip.quality.verified_route_count ?? 0} 段真实道路`,
    "",
  ];
  for (const day of trip.days) {
    lines.push(`## Day ${day.day_number} · ${day.title}`, "", `时间窗：${day.window.start}–${day.window.end}`, "");
    const ordered = [...day.assignments].sort((left, right) => left.order_index - right.order_index);
    for (let index = 0; index < ordered.length; index += 1) {
      const assignment = ordered[index];
      const poi = poiById.get(assignment.poi_id);
      if (!poi) continue;
      const time = assignment.arrival_time && assignment.departure_time ? `${assignment.arrival_time}–${assignment.departure_time}` : "时间待排";
      lines.push(`### ${index + 1}. ${time}｜${poi.name}`);
      if (poi.address) lines.push(`- 地址：${poi.address}`);
      if (poi.content?.why_visit) lines.push(`- 推荐原因：${poi.content.why_visit}`);
      if (poi.content?.watch_for?.length) lines.push(`- 到现场看：${poi.content.watch_for.join("；")}`);
      lines.push(`- 建议停留：${poi.content?.stay_minutes ?? 60} 分钟`);
      if (poi.business?.open_hours) lines.push(`- 开放提示：${poi.business.open_hours}`);
      if (assignment.notes) lines.push(`- 安排说明：${assignment.notes}`);
      lines.push("");
      const segment = day.route_segments.find((item) => item.from_poi_id === poi.id);
      if (segment) lines.push(`下一段：${segment.mode} · ${routeDistance(segment.distance_m)} · ${routeDuration(segment.duration_s)} · ${segment.status}`, "");
    }
  }
  if (trip.quality.warnings?.length) {
    lines.push("## 出发前检查", "", ...trip.quality.warnings.map((warning) => `- ${warning}`), "");
  }
  lines.push(`更新时间：${trip.provenance.updated_at}`);
  return lines.join("\n");
}

/** @param {Record<string, any>} trip */
export function tripToGeoJson(trip) {
  const features = [];
  for (const poi of trip.pois) {
    if (!poi.location) continue;
    features.push({
      type: "Feature",
      id: poi.id,
      geometry: { type: "Point", coordinates: [poi.location.lng, poi.location.lat] },
      properties: {
        feature_kind: "poi",
        name: poi.name,
        address: poi.address,
        themes: poi.themes ?? [],
        verification_status: poi.verification?.status ?? "candidate",
        assignment_status: poi.assignment_status ?? "candidate",
        coordinate_system: poi.location.coord_system,
      },
    });
  }
  for (const day of trip.days) {
    for (const segment of day.route_segments) {
      if (!Array.isArray(segment.geometry) || segment.geometry.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: segment.geometry },
        properties: {
          feature_kind: "route_segment",
          day_number: day.day_number,
          from_poi_id: segment.from_poi_id,
          to_poi_id: segment.to_poi_id,
          mode: segment.mode,
          distance_m: segment.distance_m,
          duration_s: segment.duration_s,
          status: segment.status,
          coordinate_system: trip.trip.coordinate_system,
        },
      });
    }
  }
  return {
    type: "FeatureCollection",
    name: trip.trip.title,
    coordinate_system: trip.trip.coordinate_system,
    features,
  };
}
