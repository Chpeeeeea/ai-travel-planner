/**
 * Provider-free research compiler shared by the web platform and Node tests.
 *
 * This module deliberately has no AMap imports, credentials, coordinates or
 * route concepts. It turns source evidence into name-level candidates only.
 */

export const SOURCE_WEIGHT = Object.freeze({
  official: 1,
  venue: 0.95,
  osm: 0.75,
  local_media: 0.7,
  xiaohongshu: 0.65,
  douyin: 0.55,
  other: 0.45,
});

export function normalizePlaceName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-—_·•・()（）[\]【】.,，。/]+/gu, "");
}

export function uniqueStrings(values, limit = 50) {
  const seen = new Set();
  const result = [];
  for (const value of values ?? []) {
    const text = String(value ?? "").trim();
    const key = normalizePlaceName(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function sourceWeight(item) {
  const explicit = Number(item.sourceAuthority ?? item.source?.authority);
  if (Number.isFinite(explicit)) return clamp(explicit, 0, 1);
  const kind = String(item.sourceKind ?? item.source?.kind ?? item.source?.platform ?? "other");
  return SOURCE_WEIGHT[kind] ?? SOURCE_WEIGHT.other;
}

function normalizedEvidence(item) {
  const placeName = String(item.placeName ?? item.name ?? "").trim();
  const sourceKind = String(item.sourceKind ?? item.source?.kind ?? item.source?.platform ?? "other");
  return {
    id: String(item.id ?? ""),
    lane: String(item.lane ?? "other"),
    placeName,
    normalizedName: normalizePlaceName(item.normalizedName || placeName),
    aliases: uniqueStrings(parseList(item.aliases ?? item.aliasesJson), 12),
    themes: uniqueStrings(parseList(item.themes ?? item.themesJson), 8),
    whyVisit: String(item.whyVisit ?? item.why_visit ?? "").trim(),
    watchFor: uniqueStrings(parseList(item.watchFor ?? item.watch_for ?? item.watchForJson), 12),
    stayMinutes: clamp(Math.round(Number(item.stayMinutes ?? item.stay_minutes ?? 60) || 60), 20, 360),
    riskFlags: uniqueStrings(parseList(item.riskFlags ?? item.risk_flags ?? item.riskFlagsJson), 10),
    sourceKind,
    sourceTitle: String(item.sourceTitle ?? item.source?.title ?? "").trim(),
    sourceUrl: String(item.sourceUrl ?? item.source?.url ?? "").trim(),
    sourceAuthority: sourceWeight(item),
  };
}

function compileGroup(group) {
  const ranked = [...group].sort((left, right) =>
    right.sourceAuthority - left.sourceAuthority || left.placeName.localeCompare(right.placeName, "zh-CN"));
  const canonicalName = ranked[0].placeName;
  const canonicalKey = normalizePlaceName(canonicalName);
  const names = uniqueStrings(group.flatMap((item) => [item.placeName, ...item.aliases]), 30);
  const sourceRefs = [];
  const sourceKeys = new Set();
  for (const item of group) {
    const source = {
      kind: item.sourceKind,
      title: item.sourceTitle,
      url: item.sourceUrl,
      authority: Math.round(item.sourceAuthority * 100) / 100,
    };
    const key = `${source.kind}|${source.url}|${source.title}`;
    if (!sourceKeys.has(key)) {
      sourceKeys.add(key);
      sourceRefs.push(source);
    }
  }
  return {
    canonicalName,
    normalizedName: canonicalKey,
    aliases: names.filter((name) => normalizePlaceName(name) !== canonicalKey),
    themes: uniqueStrings(group.flatMap((item) => item.themes), 12),
    whyVisit: ranked.find((item) => item.whyVisit)?.whyVisit ?? "",
    watchFor: uniqueStrings(group.flatMap((item) => item.watchFor), 20),
    stayMinutes: ranked.find((item) => item.stayMinutes)?.stayMinutes ?? 60,
    riskFlags: uniqueStrings(group.flatMap((item) => item.riskFlags), 16),
    sourceRefs,
    evidenceCount: group.length,
  };
}

export function mergeResearchEvidence(items) {
  const groups = [];
  const groupKeys = [];
  for (const rawItem of items ?? []) {
    const item = normalizedEvidence(rawItem);
    const keys = new Set(
      uniqueStrings([item.placeName, ...item.aliases])
        .map(normalizePlaceName)
        .filter(Boolean),
    );
    if (!keys.size) continue;
    const matches = [];
    groupKeys.forEach((existing, index) => {
      if ([...keys].some((key) => existing.has(key))) matches.push(index);
    });
    if (!matches.length) {
      groups.push([item]);
      groupKeys.push(keys);
      continue;
    }
    const target = matches[0];
    groups[target].push(item);
    keys.forEach((key) => groupKeys[target].add(key));
    for (const index of matches.slice(1).reverse()) {
      groups[target].push(...groups[index]);
      groupKeys[index].forEach((key) => groupKeys[target].add(key));
      groups.splice(index, 1);
      groupKeys.splice(index, 1);
    }
  }
  return groups.map(compileGroup);
}

export function candidateConstraintFit(candidate, brief = {}) {
  const candidateNameKeys = new Set(
    uniqueStrings([candidate.canonicalName, ...candidate.aliases]).map(normalizePlaceName),
  );
  const mustVisitKeys = uniqueStrings(brief.must_visit ?? []).map(normalizePlaceName);
  const mustVisitMatch = mustVisitKeys.some((key) => candidateNameKeys.has(key));
  const searchable = normalizePlaceName([
    candidate.canonicalName,
    ...candidate.aliases,
    candidate.whyVisit,
    ...candidate.watchFor,
  ].join(" "));
  const mustEatMatches = uniqueStrings(brief.must_eat ?? []).filter((item) => {
    const key = normalizePlaceName(item);
    return key && searchable.includes(key);
  });
  return { mustVisitMatch, mustEatMatches };
}

export function rankResearchCandidate(candidate, interests = [], constraints = {}) {
  const sourceKinds = new Set(candidate.sourceRefs.map((source) => source.kind));
  const interestKeys = new Set(uniqueStrings(interests).map(normalizePlaceName));
  const themeKeys = new Set(candidate.themes.map(normalizePlaceName));
  const matches = [...interestKeys].filter((key) => themeKeys.has(key)).length;
  const interestFit = interestKeys.size ? matches / interestKeys.size : 0.5;
  const authority = Math.max(0, ...candidate.sourceRefs.map((source) => Number(source.authority) || 0));
  const fit = candidateConstraintFit(candidate, constraints);
  const score = (
    authority * 30
    + Math.min(20, sourceKinds.size * 8)
    + interestFit * 25
    + Math.min(10, Math.max(0, candidate.themes.length - 1) * 5)
    + Math.min(10, candidate.evidenceCount * 2)
    + (fit.mustVisitMatch ? 100 : 0)
    + Math.min(40, fit.mustEatMatches.length * 25)
    - Math.min(20, candidate.riskFlags.length * 5)
  );
  return Math.round(score * 100) / 100;
}

export function compileResearchEvidence({ brief, evidence, minimum = 20, maximum = 40 }) {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || maximum < minimum) {
    throw new Error("candidate limits must satisfy 1 <= minimum <= maximum");
  }
  const merged = mergeResearchEvidence(evidence);
  const ranked = merged
    .map((candidate) => {
      const fit = candidateConstraintFit(candidate, brief);
      return {
        ...candidate,
        ...fit,
        userPriority: fit.mustVisitMatch ? "must_visit" : fit.mustEatMatches.length ? "must_eat" : null,
        score: rankResearchCandidate(candidate, brief?.interests ?? [], brief),
      };
    })
    .sort((left, right) => Number(right.mustVisitMatch) - Number(left.mustVisitMatch) || right.score - left.score || left.canonicalName.localeCompare(right.canonicalName, "zh-CN"))
    .map((candidate, index) => ({ ...candidate, shortlistRank: index < maximum ? index + 1 : null }));
  const shortlisted = Math.min(ranked.length, maximum);
  const warnings = shortlisted < minimum
    ? [`研究证据只形成 ${shortlisted} 个去重候选，低于目标下限 ${minimum}`]
    : [];
  return {
    stage: "shortlisted",
    providerPolicy: "研究与候选编译阶段禁止调用高德，不得写入供应商 POI ID、坐标或路线",
    providerPoiCalls: 0,
    providerRouteCalls: 0,
    counts: { evidence: evidence?.length ?? 0, deduplicated: ranked.length, shortlisted },
    warnings,
    candidates: ranked,
  };
}
