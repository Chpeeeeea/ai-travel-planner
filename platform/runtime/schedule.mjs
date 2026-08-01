import { normalizePlaceName, uniqueStrings } from "./research.mjs";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function haversineMeters(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const radians = (value) => value * Math.PI / 180;
  const earth = 6371008.8;
  const dLat = radians(right.lat - left.lat);
  const dLng = radians(right.lng - left.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(left.lat)) * Math.cos(radians(right.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

function centroid(items) {
  return {
    lng: items.reduce((sum, item) => sum + item.location.lng, 0) / items.length,
    lat: items.reduce((sum, item) => sum + item.location.lat, 0) / items.length,
  };
}

function balancedClusters(items, counts) {
  if (!items.length) return counts.map(() => []);
  const seeds = [items[0]];
  const remaining = items.slice(1);
  while (seeds.length < counts.length) {
    const next = remaining.reduce((best, item) => {
      const distance = Math.min(...seeds.map((seed) => haversineMeters(item.location, seed.location)));
      return !best || distance > best.distance ? { item, distance } : best;
    }, null);
    if (!next) break;
    seeds.push(next.item);
    remaining.splice(remaining.indexOf(next.item), 1);
  }
  const buckets = counts.map((_, index) => seeds[index] ? [seeds[index]] : []);
  for (const item of remaining) {
    const available = buckets
      .map((bucket, index) => ({ bucket, index }))
      .filter(({ bucket, index }) => bucket.length < counts[index]);
    const target = available.sort((left, right) => {
      const leftDistance = left.bucket.length ? haversineMeters(item.location, centroid(left.bucket)) : 0;
      const rightDistance = right.bucket.length ? haversineMeters(item.location, centroid(right.bucket)) : 0;
      return leftDistance - rightDistance || left.bucket.length - right.bucket.length;
    })[0];
    target.bucket.push(item);
  }
  return buckets;
}

function nearestOrder(items) {
  if (items.length < 2) return [...items];
  const remaining = [...items].sort((left, right) => right.score - left.score);
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    remaining.sort((left, right) => haversineMeters(current.location, left.location) - haversineMeters(current.location, right.location));
    ordered.push(remaining.shift());
  }
  return ordered;
}

function dayTitle(items) {
  const counts = new Map();
  for (const theme of items.flatMap((item) => item.themes ?? [])) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  const themes = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 2).map(([theme]) => theme);
  return themes.length ? `${themes.join("与")}的一天` : "城市代表性体验";
}

export function planVerifiedItinerary({ brief, candidates, dailyMinimum = 4, dailyMaximum = 6, preferred = 5 }) {
  const days = clamp(Math.round(Number(brief?.days) || 1), 1, 14);
  const minimum = clamp(Math.round(Number(dailyMinimum) || 4), 4, 6);
  const maximum = clamp(Math.round(Number(dailyMaximum) || 6), minimum, 6);
  const target = clamp(Math.round(Number(preferred) || 5), minimum, maximum);
  const eligible = (candidates ?? []).filter((item) => item.verificationStatus === "verified" && item.providerPoiId && item.location);
  if (eligible.length < days * minimum) {
    return {
      ok: false,
      code: "INSUFFICIENT_VERIFIED_POIS",
      message: `只有 ${eligible.length} 个已核验地点，无法满足 ${days} 天每天至少 ${minimum} 个地点`,
      verifiedCount: eligible.length,
      requiredCount: days * minimum,
      days: [],
    };
  }
  const requestedKeys = uniqueStrings(brief?.must_visit ?? []).map(normalizePlaceName);
  const unresolvedMustVisit = requestedKeys.filter((key) => !eligible.some((item) =>
    uniqueStrings([item.canonicalName, ...(item.aliases ?? [])]).map(normalizePlaceName).includes(key)));
  if (unresolvedMustVisit.length) {
    return {
      ok: false,
      code: "MUST_VISIT_NOT_VERIFIED",
      message: "必去地点尚未全部通过真实 POI 核验",
      unresolvedMustVisit,
      verifiedCount: eligible.length,
      days: [],
    };
  }

  const total = Math.min(eligible.length, days * target);
  const counts = Array(days).fill(minimum);
  for (let remaining = total - days * minimum, index = 0; remaining > 0; index = (index + 1) % days) {
    if (counts[index] >= maximum) continue;
    counts[index] += 1;
    remaining -= 1;
  }
  const ranked = [...eligible].sort((left, right) => {
    const leftPriority = requestedKeys.some((key) => uniqueStrings([left.canonicalName, ...(left.aliases ?? [])]).map(normalizePlaceName).includes(key));
    const rightPriority = requestedKeys.some((key) => uniqueStrings([right.canonicalName, ...(right.aliases ?? [])]).map(normalizePlaceName).includes(key));
    return Number(rightPriority) - Number(leftPriority) || right.score - left.score || left.canonicalName.localeCompare(right.canonicalName, "zh-CN");
  }).slice(0, total);
  const clusters = balancedClusters(ranked, counts);
  const plannedDays = clusters.map((items, index) => {
    const ordered = nearestOrder(items);
    return {
      dayNumber: index + 1,
      title: dayTitle(ordered),
      assignments: ordered.map((item, orderIndex) => ({
        candidateId: item.id,
        orderIndex,
        notes: item.whyVisit ? `入选理由：${item.whyVisit}` : "",
      })),
    };
  });
  return {
    ok: true,
    verifiedCount: eligible.length,
    selectedCount: total,
    routeSegmentCount: plannedDays.reduce((sum, day) => sum + Math.max(0, day.assignments.length - 1), 0),
    days: plannedDays,
  };
}

export function routeModeForPair(preference, origin, destination) {
  if (["walking", "driving", "bicycling"].includes(preference)) return preference;
  return haversineMeters(origin, destination) <= 2500 ? "walking" : "driving";
}
