#!/usr/bin/env python3
"""Small AMap Web Service adapter used when MCP is unavailable.

Responses are saved without the request key. Business logic should normalize
the returned POIs/routes into the shared trip contract.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


BASE = "https://restapi.amap.com"


def get_key() -> str:
    key = os.environ.get("AMAP_WEBSERVICE_KEY") or os.environ.get("AMAP_MAPS_API_KEY")
    if not key:
        raise RuntimeError("Set AMAP_WEBSERVICE_KEY or AMAP_MAPS_API_KEY before live REST calls")
    return key


def request_json(path: str, params: dict[str, Any], timeout: float) -> dict[str, Any]:
    clean = {name: value for name, value in params.items() if value not in (None, "")}
    clean["key"] = get_key()
    clean["appname"] = "ai-travel-planner"
    url = f"{BASE}{path}?{urllib.parse.urlencode(clean)}"
    request = urllib.request.Request(url, headers={"User-Agent": "ai-travel-planner/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"AMap HTTP error: {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"AMap network error: {exc.reason}") from exc

    status = payload.get("status")
    if status == "0" or payload.get("errcode") not in (None, 0):
        info = payload.get("info") or payload.get("errmsg") or "unknown AMap error"
        code = payload.get("infocode") or payload.get("errcode")
        raise RuntimeError(f"AMap API error {code}: {info}")
    return payload


def route_spec(mode: str) -> tuple[str, dict[str, Any]]:
    if mode == "walking":
        return "/v3/direction/walking", {}
    if mode == "driving":
        return "/v3/direction/driving", {"strategy": 10, "extensions": "all"}
    if mode == "bicycling":
        return "/v4/direction/bicycling", {}
    if mode == "transit":
        return "/v3/direction/transit/integrated", {"strategy": 0}
    raise RuntimeError(f"Unsupported route mode: {mode}")


def write_result(payload: dict[str, Any], output: str | None) -> None:
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    if output:
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered + "\n", encoding="utf-8")
        print(json.dumps({"status": "ok", "output": str(path.resolve())}, ensure_ascii=False))
    else:
        print(rendered)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=float, default=20.0)
    subparsers = parser.add_subparsers(dest="command", required=True)

    text_parser = subparsers.add_parser("poi-text")
    text_parser.add_argument("--keywords", required=True)
    text_parser.add_argument("--region", default="")
    text_parser.add_argument("--types", default="")
    text_parser.add_argument("--city-limit", action="store_true")
    text_parser.add_argument("--page-size", type=int, default=10)
    text_parser.add_argument("--page-num", type=int, default=1)
    text_parser.add_argument("--show-fields", default="business,photos,navi")
    text_parser.add_argument("--output")

    around_parser = subparsers.add_parser("poi-around")
    around_parser.add_argument("--location", required=True)
    around_parser.add_argument("--keywords", default="")
    around_parser.add_argument("--types", default="")
    around_parser.add_argument("--radius", type=int, default=1000)
    around_parser.add_argument("--page-size", type=int, default=10)
    around_parser.add_argument("--page-num", type=int, default=1)
    around_parser.add_argument("--show-fields", default="business,photos,navi")
    around_parser.add_argument("--output")

    detail_parser = subparsers.add_parser("poi-detail")
    detail_parser.add_argument("--id", required=True)
    detail_parser.add_argument("--show-fields", default="business,photos,navi")
    detail_parser.add_argument("--output")

    route_parser = subparsers.add_parser("route")
    route_parser.add_argument("--mode", choices=["walking", "driving", "bicycling", "transit"], required=True)
    route_parser.add_argument("--origin", required=True)
    route_parser.add_argument("--destination", required=True)
    route_parser.add_argument("--city")
    route_parser.add_argument("--cityd")
    route_parser.add_argument("--waypoints")
    route_parser.add_argument("--output")
    args = parser.parse_args()

    try:
        if args.command == "poi-text":
            payload = request_json(
                "/v5/place/text",
                {
                    "keywords": args.keywords,
                    "region": args.region,
                    "types": args.types,
                    "city_limit": "true" if args.city_limit else "false",
                    "page_size": max(1, min(args.page_size, 25)),
                    "page_num": max(1, args.page_num),
                    "show_fields": args.show_fields,
                },
                args.timeout,
            )
            output = args.output
        elif args.command == "poi-around":
            payload = request_json(
                "/v5/place/around",
                {
                    "location": args.location,
                    "keywords": args.keywords,
                    "types": args.types,
                    "radius": max(0, min(args.radius, 50000)),
                    "page_size": max(1, min(args.page_size, 25)),
                    "page_num": max(1, args.page_num),
                    "show_fields": args.show_fields,
                },
                args.timeout,
            )
            output = args.output
        elif args.command == "poi-detail":
            payload = request_json(
                "/v5/place/detail",
                {"id": args.id, "show_fields": args.show_fields},
                args.timeout,
            )
            output = args.output
        else:
            path, defaults = route_spec(args.mode)
            params = {
                **defaults,
                "origin": args.origin,
                "destination": args.destination,
                "city": args.city,
                "cityd": args.cityd,
                "waypoints": args.waypoints,
            }
            if args.mode == "transit" and not args.city:
                raise RuntimeError("Transit routing requires --city")
            payload = request_json(path, params, args.timeout)
            output = args.output
        write_result(payload, output)
        return 0
    except Exception as exc:
        print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
