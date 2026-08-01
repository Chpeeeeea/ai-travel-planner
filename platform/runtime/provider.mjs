import { normalizePlaceName, uniqueStrings } from "./research.mjs";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLocation(value) {
  if (typeof value === "object" && value) {
    const lng = number(value.lng);
    const lat = number(value.lat);
    return lng !== null && lat !== null ? { lng, lat, coord_system: "GCJ-02" } : null;
  }
  const [rawLng, rawLat] = String(value ?? "").split(",");
  const lng = number(rawLng);
  const lat = number(rawLat);
  if (lng === null || lat === null || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return { lng, lat, coord_system: "GCJ-02" };
}

function list(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? Object.values(value) : [];
}

export function normalizeAmapPoi(raw, rank = 0) {
  const business = raw?.business && typeof raw.business === "object" ? raw.business : {};
  return {
    provider: "amap",
    providerPoiId: String(raw?.id ?? "").trim(),
    name: String(raw?.name ?? "").trim(),
    aliases: uniqueStrings(String(business.alias ?? raw?.alias ?? "").split(/[|,，;/]/), 12),
    address: String(raw?.address ?? "").trim(),
    type: String(raw?.type ?? "").trim(),
    typecode: String(raw?.typecode ?? "").trim(),
    provinceName: String(raw?.pname ?? "").trim(),
    cityName: String(raw?.cityname ?? "").trim(),
    districtName: String(raw?.adname ?? "").trim(),
    provinceCode: String(raw?.pcode ?? "").trim(),
    cityCode: String(raw?.citycode ?? "").trim(),
    adcode: String(raw?.adcode ?? "").trim(),
    location: parseLocation(raw?.location),
    business: {
      openToday: String(business.opentime_today ?? "").trim() || null,
      openWeek: String(business.opentime_week ?? "").trim() || null,
      rating: number(business.rating),
      cost: number(business.cost),
      tag: String(business.tag ?? "").trim() || null,
      telephone: String(business.tel ?? "").trim() || null,
    },
    rank,
    raw,
  };
}

function isThemeTypeMatch(themes, typecode) {
  const keys = new Set(uniqueStrings(themes).map(normalizePlaceName));
  const prefix = String(typecode ?? "").slice(0, 2);
  if (keys.has("美食") && prefix === "05") return true;
  if ((keys.has("风景") || keys.has("历史") || keys.has("文化")) && ["11", "14"].includes(prefix)) return true;
  return false;
}

function containsEither(left, right) {
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

export function scoreAmapPoi(candidate, poi, destination) {
  const canonicalKey = normalizePlaceName(candidate.canonicalName ?? candidate.canonical_name);
  const aliasKeys = uniqueStrings(candidate.aliases ?? []).map(normalizePlaceName);
  const providerKeys = uniqueStrings([poi.name, ...poi.aliases]).map(normalizePlaceName);
  let score = 0;
  if (providerKeys.includes(canonicalKey)) score += 0.45;
  else if (aliasKeys.some((key) => providerKeys.includes(key))) score += 0.35;
  else if (providerKeys.some((key) => containsEither(key, canonicalKey))) score += 0.2;

  const destinationKey = normalizePlaceName(destination);
  const regionKeys = [poi.cityName, poi.districtName, poi.provinceName, poi.address].map(normalizePlaceName).filter(Boolean);
  const regionMatch = regionKeys.some((key) => containsEither(key, destinationKey));
  if (regionMatch) score += 0.2;
  else if (destinationKey && (poi.cityName || poi.districtName)) score -= 0.3;

  if (isThemeTypeMatch(candidate.themes ?? [], poi.typecode)) score += 0.15;
  if (poi.location && poi.providerPoiId) score += 0.05;
  if (poi.rank === 0) score += 0.05;
  return Math.round(clamp(score, 0, 1) * 100) / 100;
}

export function chooseAmapMatch(candidate, rawPois, destination, options = {}) {
  const threshold = Number(options.threshold ?? 0.8);
  const marginThreshold = Number(options.margin ?? 0.15);
  const matches = list(rawPois)
    .map((raw, index) => normalizeAmapPoi(raw, index))
    .filter((poi) => poi.providerPoiId && poi.name && poi.location)
    .map((poi) => ({ ...poi, confidence: scoreAmapPoi(candidate, poi, destination) }))
    .sort((left, right) => right.confidence - left.confidence || left.rank - right.rank)
    .slice(0, 3);
  if (!matches.length) return { status: "not_found", selected: null, matches: [], margin: 0 };
  const margin = Math.round((matches[0].confidence - (matches[1]?.confidence ?? 0)) * 100) / 100;
  const verified = matches[0].confidence >= threshold && margin >= marginThreshold;
  return {
    status: verified ? "verified" : "needs_confirmation",
    selected: verified ? matches[0] : null,
    matches,
    margin,
  };
}

function collectPolyline(value, points) {
  if (!value) return;
  if (typeof value === "string") {
    for (const pair of value.split(";")) {
      const location = parseLocation(pair);
      if (!location) continue;
      const last = points[points.length - 1];
      if (!last || last[0] !== location.lng || last[1] !== location.lat) points.push([location.lng, location.lat]);
    }
    return;
  }
  if (Array.isArray(value)) value.forEach((item) => collectPolyline(item, points));
  else if (typeof value === "object") Object.values(value).forEach((item) => collectPolyline(item, points));
}

export function normalizeAmapRoute(payload, mode) {
  const paths = list(payload?.route?.paths ?? payload?.data?.paths);
  const path = paths[0];
  if (!path) throw new Error("AMap route response contains no path");
  const distanceM = number(path.distance);
  const durationS = number(path?.cost?.duration ?? path.duration);
  const geometry = [];
  collectPolyline(path.steps, geometry);
  const instructions = uniqueStrings(list(path.steps).map((step) => step?.instruction).filter(Boolean), 50);
  return {
    mode,
    provider: "amap-webservice-v5",
    distanceM: distanceM === null ? null : Math.max(0, Math.round(distanceM)),
    durationS: durationS === null ? null : Math.max(0, Math.round(durationS)),
    geometry,
    summary: instructions.join("；"),
    status: "verified",
  };
}

export function straightLineFallback(origin, destination, mode) {
  return {
    mode,
    provider: null,
    distanceM: null,
    durationS: null,
    geometry: [[origin.lng, origin.lat], [destination.lng, destination.lat]],
    summary: "真实道路暂不可用，仅显示端点连线",
    status: "fallback_straight_line",
  };
}
