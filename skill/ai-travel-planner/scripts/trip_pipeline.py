#!/usr/bin/env python3
"""Initialize, validate and optimize ai-travel-planner trip files."""

from __future__ import annotations

import argparse
import copy
import json
import math
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VALID_POI_STATES = {"candidate", "needs_confirmation", "verified", "stale", "rejected"}
VALID_ROUTE_STATES = {"pending", "verified", "fallback_straight_line", "failed", "transport_break"}
VALID_MODES = {"walking", "driving", "bicycling", "transit", "mixed"}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def slugify(value: str) -> str:
    ascii_slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return ascii_slug or f"trip-{uuid.uuid4().hex[:8]}"


def load_json(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_json(data: dict[str, Any], path: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def initialize(city: str, days: int, title: str | None, timezone_name: str) -> dict[str, Any]:
    trip_id = slugify(title or city)
    timestamp = now_iso()
    return {
        "schema_version": "1.0",
        "trip": {
            "id": trip_id,
            "title": title or f"{city}旅行计划",
            "city": city,
            "timezone": timezone_name,
            "coordinate_system": "GCJ-02",
            "start_date": None,
            "end_date": None,
            "default_mode": "mixed",
            "daily_window": {"start": "09:00", "end": "18:00"},
            "hotel_poi_id": None,
            "assumptions": ["日期未指定", "默认每日 09:00–18:00", "默认中等强度"],
        },
        "pois": [],
        "days": [
            {
                "id": f"day-{index}",
                "day_number": index,
                "date": None,
                "title": f"第 {index} 天",
                "window": {"start": "09:00", "end": "18:00"},
                "start_anchor_poi_id": None,
                "end_anchor_poi_id": None,
                "assignments": [],
                "route_segments": [],
            }
            for index in range(1, days + 1)
        ],
        "provenance": {
            "research_sources": [],
            "poi_provider": "amap-mcp",
            "route_provider": "amap-mcp",
            "generated_at": timestamp,
            "updated_at": timestamp,
        },
        "quality": {
            "status": "draft",
            "warnings": ["高德 POI 与路线尚未核验"],
            "unverified_poi_count": 0,
            "pending_route_count": 0,
        },
    }


def coordinates(poi: dict[str, Any] | None) -> tuple[float, float] | None:
    if not poi:
        return None
    location = poi.get("location") or {}
    lng, lat = location.get("lng"), location.get("lat")
    if isinstance(lng, (int, float)) and isinstance(lat, (int, float)):
        if -180 <= lng <= 180 and -90 <= lat <= 90:
            return float(lng), float(lat)
    return None


def validate(data: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if data.get("schema_version") != "1.0":
        errors.append("schema_version must be 1.0")
    trip = data.get("trip")
    if not isinstance(trip, dict):
        return ["trip must be an object"], warnings
    for field in ("id", "title", "city", "timezone", "coordinate_system"):
        if not trip.get(field):
            errors.append(f"trip.{field} is required")
    if trip.get("default_mode") not in VALID_MODES:
        errors.append(f"trip.default_mode must be one of {sorted(VALID_MODES)}")

    pois = data.get("pois")
    days = data.get("days")
    if not isinstance(pois, list):
        errors.append("pois must be an array")
        pois = []
    if not isinstance(days, list):
        errors.append("days must be an array")
        days = []

    poi_by_id: dict[str, dict[str, Any]] = {}
    provider_keys: set[tuple[str, str]] = set()
    unverified = 0
    for index, poi in enumerate(pois):
        prefix = f"pois[{index}]"
        if not isinstance(poi, dict):
            errors.append(f"{prefix} must be an object")
            continue
        poi_id = poi.get("id")
        if not poi_id:
            errors.append(f"{prefix}.id is required")
            continue
        if poi_id in poi_by_id:
            errors.append(f"duplicate POI id: {poi_id}")
        poi_by_id[poi_id] = poi
        verification = poi.get("verification") or {}
        state = verification.get("status", "candidate")
        if state not in VALID_POI_STATES:
            errors.append(f"{prefix}.verification.status is invalid: {state}")
        if state != "verified":
            unverified += 1
        if state == "verified":
            if not poi.get("provider") or not poi.get("provider_poi_id"):
                errors.append(f"{prefix} is verified but provider/provider_poi_id is missing")
            if not coordinates(poi):
                errors.append(f"{prefix} is verified but coordinates are missing or invalid")
            if not verification.get("verified_at"):
                errors.append(f"{prefix} is verified but verified_at is missing")
        provider_id = poi.get("provider_poi_id")
        provider = poi.get("provider")
        if provider and provider_id:
            provider_key = (str(provider), str(provider_id))
            if provider_key in provider_keys:
                errors.append(f"duplicate provider POI: {provider}:{provider_id}")
            provider_keys.add(provider_key)
        location = poi.get("location") or {}
        if location and not location.get("coord_system"):
            errors.append(f"{prefix}.location.coord_system is required when coordinates exist")

    pending_routes = 0
    day_numbers: set[int] = set()
    for day_index, day in enumerate(days):
        prefix = f"days[{day_index}]"
        if not isinstance(day, dict):
            errors.append(f"{prefix} must be an object")
            continue
        number = day.get("day_number")
        if number in day_numbers:
            errors.append(f"duplicate day_number: {number}")
        day_numbers.add(number)
        assignments = day.get("assignments") or []
        indexes: set[int] = set()
        ordered: list[str] = []
        for assignment_index, assignment in enumerate(assignments):
            ap = f"{prefix}.assignments[{assignment_index}]"
            poi_id = assignment.get("poi_id")
            if poi_id not in poi_by_id:
                errors.append(f"{ap}.poi_id references unknown POI: {poi_id}")
            order_index = assignment.get("order_index")
            if not isinstance(order_index, int):
                errors.append(f"{ap}.order_index must be an integer")
            elif order_index in indexes:
                errors.append(f"{prefix} has duplicate order_index {order_index}")
            else:
                indexes.add(order_index)
            ordered.append(poi_id)
        if indexes and indexes != set(range(len(assignments))):
            errors.append(f"{prefix} order_index must be contiguous from zero")

        segments = day.get("route_segments") or []
        expected_pairs = set(zip(ordered, ordered[1:]))
        for segment_index, segment in enumerate(segments):
            sp = f"{prefix}.route_segments[{segment_index}]"
            state = segment.get("status")
            if state not in VALID_ROUTE_STATES:
                errors.append(f"{sp}.status is invalid: {state}")
            if state == "pending":
                pending_routes += 1
            if state == "fallback_straight_line" and segment.get("duration_s") is not None:
                errors.append(f"{sp} fallback route must not contain duration_s")
            pair = (segment.get("from_poi_id"), segment.get("to_poi_id"))
            if pair not in expected_pairs and state != "transport_break":
                warnings.append(f"{sp} does not connect consecutive assignments: {pair}")

    hotel = trip.get("hotel_poi_id")
    if hotel and hotel not in poi_by_id:
        errors.append(f"trip.hotel_poi_id references unknown POI: {hotel}")
    if trip.get("coordinate_system") != "GCJ-02":
        warnings.append("AMap-first trips should normally use GCJ-02")
    if unverified:
        warnings.append(f"{unverified} POI(s) are not verified")
    if pending_routes:
        warnings.append(f"{pending_routes} route segment(s) are pending")
    return errors, warnings


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    lng1, lat1 = map(math.radians, a)
    lng2, lat2 = map(math.radians, b)
    delta_lng, delta_lat = lng2 - lng1, lat2 - lat1
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(value))


def route_cost(
    items: list[dict[str, Any]],
    poi_by_id: dict[str, dict[str, Any]],
    start: tuple[float, float] | None,
    end: tuple[float, float] | None,
) -> float:
    points = [coordinates(poi_by_id.get(item.get("poi_id"))) for item in items]
    if any(point is None for point in points):
        return math.inf
    typed_points = [point for point in points if point is not None]
    total = sum(haversine(a, b) for a, b in zip(typed_points, typed_points[1:]))
    if start and typed_points:
        total += haversine(start, typed_points[0])
    if end and typed_points:
        total += haversine(typed_points[-1], end)
    return total


def optimize_block(
    block: list[dict[str, Any]],
    poi_by_id: dict[str, dict[str, Any]],
    start: tuple[float, float] | None,
    end: tuple[float, float] | None,
) -> list[dict[str, Any]]:
    if len(block) < 2:
        return block
    remaining = block[:]
    if start:
        first = min(remaining, key=lambda item: haversine(start, coordinates(poi_by_id[item["poi_id"]]) or start))
    else:
        first = remaining[0]
    route = [first]
    remaining.remove(first)
    while remaining:
        current = coordinates(poi_by_id[route[-1]["poi_id"]])
        if current is None:
            route.extend(remaining)
            break
        next_item = min(
            remaining,
            key=lambda item: haversine(current, coordinates(poi_by_id[item["poi_id"]]) or current),
        )
        route.append(next_item)
        remaining.remove(next_item)

    improved = True
    while improved:
        improved = False
        current_cost = route_cost(route, poi_by_id, start, end)
        for left in range(0, len(route) - 1):
            for right in range(left + 2, len(route) + 1):
                candidate = route[:left] + list(reversed(route[left:right])) + route[right:]
                candidate_cost = route_cost(candidate, poi_by_id, start, end)
                if candidate_cost + 0.01 < current_cost:
                    route = candidate
                    current_cost = candidate_cost
                    improved = True
    return route


def optimize_day(day: dict[str, Any], poi_by_id: dict[str, dict[str, Any]]) -> None:
    assignments = copy.deepcopy(day.get("assignments") or [])
    if len(assignments) < 2:
        return
    barriers = []
    for index, assignment in enumerate(assignments):
        poi = poi_by_id.get(assignment.get("poi_id"))
        if assignment.get("locked") or coordinates(poi) is None:
            barriers.append(index)

    anchor_start = coordinates(poi_by_id.get(day.get("start_anchor_poi_id")))
    anchor_end = coordinates(poi_by_id.get(day.get("end_anchor_poi_id")))
    result = assignments[:]
    boundaries = [-1] + barriers + [len(assignments)]
    for boundary_index in range(len(boundaries) - 1):
        left_barrier = boundaries[boundary_index]
        right_barrier = boundaries[boundary_index + 1]
        start_index = left_barrier + 1
        end_index = right_barrier
        block = assignments[start_index:end_index]
        if not block:
            continue
        left_point = anchor_start if left_barrier == -1 else coordinates(poi_by_id.get(assignments[left_barrier].get("poi_id")))
        right_point = anchor_end if right_barrier == len(assignments) else coordinates(poi_by_id.get(assignments[right_barrier].get("poi_id")))
        result[start_index:end_index] = optimize_block(block, poi_by_id, left_point, right_point)
    for index, assignment in enumerate(result):
        assignment["order_index"] = index
    day["assignments"] = result
    day["route_segments"] = []


def update_quality(data: dict[str, Any], warnings: list[str]) -> None:
    unverified = sum(
        1 for poi in data.get("pois", []) if (poi.get("verification") or {}).get("status") != "verified"
    )
    pending = sum(
        1
        for day in data.get("days", [])
        for segment in day.get("route_segments", [])
        if segment.get("status") == "pending"
    )
    quality = data.setdefault("quality", {})
    quality["unverified_poi_count"] = unverified
    quality["pending_route_count"] = pending
    quality["warnings"] = warnings
    quality["status"] = "verified" if not unverified and not pending and not warnings else "draft"
    data.setdefault("provenance", {})["updated_at"] = now_iso()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init")
    init_parser.add_argument("--city", required=True)
    init_parser.add_argument("--days", type=int, default=1)
    init_parser.add_argument("--title")
    init_parser.add_argument("--timezone", default="Asia/Shanghai")
    init_parser.add_argument("--output", required=True)

    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("--input", required=True)

    optimize_parser = subparsers.add_parser("optimize")
    optimize_parser.add_argument("--input", required=True)
    optimize_parser.add_argument("--output", required=True)
    args = parser.parse_args()

    if args.command == "init":
        if args.days < 1 or args.days > 60:
            parser.error("--days must be between 1 and 60")
        data = initialize(args.city, args.days, args.title, args.timezone)
        save_json(data, args.output)
        print(json.dumps({"status": "ok", "output": str(Path(args.output).resolve())}, ensure_ascii=False))
        return 0

    try:
        data = load_json(args.input)
    except Exception as exc:
        print(json.dumps({"status": "error", "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        return 1

    if args.command == "optimize":
        poi_by_id = {poi.get("id"): poi for poi in data.get("pois", []) if poi.get("id")}
        for day in data.get("days", []):
            optimize_day(day, poi_by_id)
        errors, warnings = validate(data)
        update_quality(data, warnings)
        if errors:
            print(json.dumps({"status": "error", "errors": errors, "warnings": warnings}, ensure_ascii=False, indent=2))
            return 1
        save_json(data, args.output)
        print(json.dumps({"status": "ok", "output": str(Path(args.output).resolve()), "warnings": warnings}, ensure_ascii=False, indent=2))
        return 0

    errors, warnings = validate(data)
    print(json.dumps({"status": "ok" if not errors else "error", "errors": errors, "warnings": warnings}, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
