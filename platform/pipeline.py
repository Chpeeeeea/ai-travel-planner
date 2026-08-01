#!/usr/bin/env python3
"""Compile research evidence into an AMap-efficient travel planning run.

The pipeline deliberately separates discovery from live map-provider calls:
research evidence -> name-level shortlist -> AMap verification manifest ->
verified daily assignments -> adjacent-only route manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any


SOURCE_WEIGHT = {
    "official": 1.0,
    "venue": 0.95,
    "osm": 0.75,
    "local_media": 0.70,
    "xiaohongshu": 0.65,
    "douyin": 0.55,
    "other": 0.45,
}


def load_json(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_json(data: dict[str, Any], path: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalized_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[\s\-—_·•・()（）\[\]【】.,，。/]+", "", value)


def stable_candidate_id(name: str) -> str:
    normalized = normalized_name(name)
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:10]
    ascii_part = re.sub(r"[^a-z0-9]+", "-", name.casefold()).strip("-")
    if ascii_part:
        return f"candidate-{ascii_part[:36]}-{digest}"
    return f"candidate-{digest}"


def unique_strings(values: list[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = str(value).strip()
        key = normalized_name(text)
        if text and key not in seen:
            seen.add(key)
            result.append(text)
    return result


def source_score(source: dict[str, Any]) -> float:
    kind = str(source.get("kind") or source.get("platform") or "other")
    return float(source.get("authority") or SOURCE_WEIGHT.get(kind, SOURCE_WEIGHT["other"]))


def merge_evidence(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: list[list[dict[str, Any]]] = []
    group_keys: list[set[str]] = []
    for item in items:
        names = unique_strings([item.get("name", ""), *(item.get("aliases") or [])])
        keys = {normalized_name(name) for name in names if normalized_name(name)}
        if not keys:
            continue
        matches = [index for index, existing in enumerate(group_keys) if existing & keys]
        if not matches:
            groups.append([item])
            group_keys.append(keys)
            continue
        target = matches[0]
        groups[target].append(item)
        group_keys[target].update(keys)
        for index in reversed(matches[1:]):
            groups[target].extend(groups.pop(index))
            group_keys[target].update(group_keys.pop(index))
    return [compile_group(group) for group in groups]


def compile_group(group: list[dict[str, Any]]) -> dict[str, Any]:
    ranked = sorted(group, key=lambda item: source_score(item.get("source") or {}), reverse=True)
    canonical_name = str(ranked[0]["name"]).strip()
    names = unique_strings([value for item in group for value in [item.get("name", ""), *(item.get("aliases") or [])]])
    themes = unique_strings([theme for item in group for theme in (item.get("themes") or [])])
    sources = []
    for item in group:
        source = item.get("source") or {}
        sources.append({
            "kind": source.get("kind") or source.get("platform") or "other",
            "title": source.get("title") or "",
            "url": source.get("url") or "",
            "authority": round(source_score(source), 2),
        })
    return {
        "candidate_id": stable_candidate_id(canonical_name),
        "canonical_name": canonical_name,
        "aliases": [name for name in names if normalized_name(name) != normalized_name(canonical_name)],
        "themes": themes,
        "why_visit": next((str(item.get("why_visit")) for item in ranked if item.get("why_visit")), ""),
        "watch_for": unique_strings([point for item in group for point in (item.get("watch_for") or [])]),
        "stay_minutes": max(20, min(360, int(next((item.get("stay_minutes") for item in ranked if item.get("stay_minutes")), 60)))),
        "risk_flags": unique_strings([risk for item in group for risk in (item.get("risk_flags") or [])]),
        "source_refs": sources,
        "evidence_count": len(group),
        "verification": {"status": "candidate", "provider": None, "provider_poi_id": None},
    }


def rank_candidate(candidate: dict[str, Any], interests: list[str]) -> float:
    sources = candidate["source_refs"]
    platforms = {source["kind"] for source in sources}
    interest_keys = {normalized_name(value) for value in interests}
    theme_keys = {normalized_name(value) for value in candidate["themes"]}
    interest_fit = len(interest_keys & theme_keys) / max(1, len(interest_keys)) if interest_keys else 0.5
    score = (
        max((source["authority"] for source in sources), default=0) * 30
        + min(20, len(platforms) * 8)
        + interest_fit * 25
        + min(10, max(0, len(candidate["themes"]) - 1) * 5)
        + min(10, candidate["evidence_count"] * 2)
        - min(20, len(candidate["risk_flags"]) * 5)
    )
    return round(score, 2)


def compile_candidates(brief: dict[str, Any], evidence: dict[str, Any], minimum: int, maximum: int) -> dict[str, Any]:
    if minimum < 1 or maximum < minimum:
        raise ValueError("candidate limits must satisfy 1 <= minimum <= maximum")
    merged = merge_evidence(evidence.get("items") or [])
    interests = brief.get("interests") or []
    for candidate in merged:
        candidate["score"] = rank_candidate(candidate, interests)
    ranked = sorted(merged, key=lambda item: (-item["score"], item["canonical_name"]))
    shortlist = ranked[:maximum]
    warnings = []
    if len(shortlist) < minimum:
        warnings.append(f"研究证据只形成 {len(shortlist)} 个去重候选，低于目标下限 {minimum}")
    return {
        "schema_version": "1.0",
        "stage": "shortlisted",
        "brief": brief,
        "counts": {"evidence": len(evidence.get("items") or []), "deduplicated": len(merged), "shortlisted": len(shortlist)},
        "provider_policy": "本阶段禁止调用高德；不得写入高德 POI ID 或 GCJ-02 坐标",
        "warnings": warnings,
        "candidates": shortlist,
    }


def prepare_amap(shortlist: dict[str, Any]) -> dict[str, Any]:
    city = shortlist.get("brief", {}).get("destination") or shortlist.get("brief", {}).get("city")
    queries = [
        {
            "candidate_id": candidate["candidate_id"],
            "keywords": candidate["canonical_name"],
            "aliases": candidate.get("aliases") or [],
            "city": city,
            "citylimit": True,
            "required_result": ["provider_poi_id", "name", "address", "typecode", "gcj02_location", "match_confidence"],
        }
        for candidate in shortlist.get("candidates") or []
    ]
    return {
        "schema_version": "1.0",
        "stage": "amap_verification_manifest",
        "policy": "只允许 text search 与 detail；完成排程前禁止路线调用",
        "query_count": len(queries),
        "queries": queries,
    }


def point(candidate: dict[str, Any]) -> tuple[float, float] | None:
    location = candidate.get("location") or {}
    if not isinstance(location.get("lng"), (int, float)) or not isinstance(location.get("lat"), (int, float)):
        return None
    return float(location["lng"]), float(location["lat"])


def distance(a: dict[str, Any], b: dict[str, Any]) -> float:
    pa, pb = point(a), point(b)
    if not pa or not pb:
        return math.inf
    mean_lat = math.radians((pa[1] + pb[1]) / 2)
    dx = (pa[0] - pb[0]) * 111_320 * math.cos(mean_lat)
    dy = (pa[1] - pb[1]) * 110_540
    return math.hypot(dx, dy)


def order_nearest(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(items) < 2:
        return items
    remaining = sorted(items, key=lambda item: (-float(item.get("score", 0)), item["canonical_name"]))
    ordered = [remaining.pop(0)]
    while remaining:
        next_item = min(remaining, key=lambda item: distance(ordered[-1], item))
        ordered.append(next_item)
        remaining.remove(next_item)
    return ordered


def cluster_days(items: list[dict[str, Any]], days: int, capacity: int) -> list[list[dict[str, Any]]]:
    if not items:
        return [[] for _ in range(days)]
    seeds = [items[0]]
    remaining = items[1:]
    while len(seeds) < min(days, len(items)):
        seed = max(remaining, key=lambda item: min(distance(item, existing) for existing in seeds))
        seeds.append(seed)
        remaining.remove(seed)
    buckets = [[seed] for seed in seeds] + [[] for _ in range(days - len(seeds))]

    def centroid(bucket: list[dict[str, Any]]) -> tuple[float, float] | None:
        points = [point(item) for item in bucket if point(item)]
        if not points:
            return None
        return sum(value[0] for value in points) / len(points), sum(value[1] for value in points) / len(points)

    def centroid_distance(item: dict[str, Any], bucket: list[dict[str, Any]]) -> float:
        center = centroid(bucket)
        location = point(item)
        if not center or not location:
            return math.inf
        proxy = {"location": {"lng": center[0], "lat": center[1]}}
        return distance(item, proxy)

    for item in remaining:
        available = [index for index, bucket in enumerate(buckets) if len(bucket) < capacity]
        target = min(available, key=lambda index: (centroid_distance(item, buckets[index]), len(buckets[index])))
        buckets[target].append(item)
    return buckets


def schedule_verified(brief: dict[str, Any], verified: dict[str, Any], stops_per_day: int) -> dict[str, Any]:
    days = int(brief.get("days") or 1)
    stops = max(4, min(6, stops_per_day))
    eligible = [
        candidate for candidate in (verified.get("candidates") or [])
        if (candidate.get("verification") or {}).get("status") == "verified"
        and (candidate.get("verification") or {}).get("provider") == "amap"
        and point(candidate)
    ]
    selected = sorted(eligible, key=lambda item: (-float(item.get("score", 0)), item["canonical_name"]))[: days * stops]
    buckets = cluster_days(selected, days, stops)

    day_plans = []
    route_query_count = 0
    for index, bucket in enumerate(buckets, start=1):
        ordered = order_nearest(bucket)
        assignments = [
            {"candidate_id": item["candidate_id"], "poi_id": item["candidate_id"], "provider_poi_id": item["provider_poi_id"], "order_index": order}
            for order, item in enumerate(ordered)
        ]
        segments = [
            {
                "from_candidate_id": before["candidate_id"],
                "to_candidate_id": after["candidate_id"],
                "mode": "auto",
                "status": "pending",
            }
            for before, after in zip(ordered, ordered[1:])
        ]
        route_query_count += len(segments)
        day_plans.append({"day_number": index, "assignments": assignments, "route_segments": segments})

    warnings = []
    if len(selected) < days * 4:
        warnings.append(f"只有 {len(selected)} 个已核验地点，无法满足每天至少 4 个地点")
    return {
        "schema_version": "1.0",
        "stage": "scheduled",
        "brief": brief,
        "selection_policy": "每天 4–6 个已核验地点；先按研究得分选点，再用坐标近邻排序",
        "verified_candidate_count": len(eligible),
        "selected_candidate_count": len(selected),
        "route_policy": "只请求同一天相邻行程点，不为候选池计算路线",
        "route_query_count": route_query_count,
        "warnings": warnings,
        "days": day_plans,
    }


def audit(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    stage = data.get("stage")
    if stage == "shortlisted":
        for candidate in data.get("candidates") or []:
            verification = candidate.get("verification") or {}
            if verification.get("provider_poi_id") or candidate.get("location"):
                errors.append(f"{candidate.get('candidate_id')} 在研究阶段包含地图供应商实体数据")
    if stage == "scheduled":
        for day in data.get("days") or []:
            ordered = [item.get("candidate_id") for item in sorted(day.get("assignments") or [], key=lambda item: item.get("order_index", -1))]
            expected = list(zip(ordered, ordered[1:]))
            actual = [(item.get("from_candidate_id"), item.get("to_candidate_id")) for item in day.get("route_segments") or []]
            if actual != expected:
                errors.append(f"Day {day.get('day_number')} 的路线请求不是相邻行程点")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    compile_parser = commands.add_parser("compile")
    compile_parser.add_argument("--brief", required=True)
    compile_parser.add_argument("--evidence", required=True)
    compile_parser.add_argument("--min", type=int, default=20)
    compile_parser.add_argument("--max", type=int, default=40)
    compile_parser.add_argument("--output", required=True)

    verify_parser = commands.add_parser("prepare-amap")
    verify_parser.add_argument("--input", required=True)
    verify_parser.add_argument("--output", required=True)

    schedule_parser = commands.add_parser("schedule")
    schedule_parser.add_argument("--brief", required=True)
    schedule_parser.add_argument("--verified", required=True)
    schedule_parser.add_argument("--stops-per-day", type=int, default=5)
    schedule_parser.add_argument("--output", required=True)

    audit_parser = commands.add_parser("audit")
    audit_parser.add_argument("--input", required=True)
    args = parser.parse_args()

    try:
        if args.command == "compile":
            result = compile_candidates(load_json(args.brief), load_json(args.evidence), args.min, args.max)
            save_json(result, args.output)
        elif args.command == "prepare-amap":
            result = prepare_amap(load_json(args.input))
            save_json(result, args.output)
        elif args.command == "schedule":
            result = schedule_verified(load_json(args.brief), load_json(args.verified), args.stops_per_day)
            save_json(result, args.output)
        else:
            errors = audit(load_json(args.input))
            print(json.dumps({"status": "error" if errors else "ok", "errors": errors}, ensure_ascii=False, indent=2))
            return 1 if errors else 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "error", "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps({"status": "ok", "output": str(Path(args.output).resolve())}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
