#!/usr/bin/env python3
"""Minimal stdio client for the official AMap MCP package.

The bridge keeps the API key in the child process environment and exposes three
commands that are easy for an agent or a human to verify: doctor, list-tools,
and call. It intentionally has no third-party Python dependencies.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from typing import Any


CLIENT_NAME = "ai-travel-planner-bridge"
CLIENT_VERSION = "0.1.0"
DEFAULT_PACKAGE = "@amap/amap-maps-mcp-server@0.0.8"
PROTOCOL_VERSION = "2025-03-26"


class MCPError(RuntimeError):
    pass


def key_is_set() -> bool:
    return bool(os.environ.get("AMAP_MAPS_API_KEY") or os.environ.get("AMAP_WEBSERVICE_KEY"))


def parse_node_version(raw: str) -> tuple[int, int, int]:
    match = re.search(r"v?(\d+)\.(\d+)\.(\d+)", raw)
    if not match:
        return (0, 0, 0)
    return tuple(int(value) for value in match.groups())


def executable(name: str) -> str | None:
    if platform.system() == "Windows" and not name.endswith(".cmd"):
        return shutil.which(f"{name}.cmd") or shutil.which(name)
    return shutil.which(name)


class StdioMCPClient:
    def __init__(self, package: str, timeout: float = 30.0) -> None:
        self.package = package
        self.timeout = timeout
        self.process: subprocess.Popen[str] | None = None
        self.lines: queue.Queue[str | None] = queue.Queue()
        self.next_id = 1

    def __enter__(self) -> "StdioMCPClient":
        npx = executable("npx")
        if not npx:
            raise MCPError("npx is not available on PATH")
        env = os.environ.copy()
        if not env.get("AMAP_MAPS_API_KEY") and env.get("AMAP_WEBSERVICE_KEY"):
            env["AMAP_MAPS_API_KEY"] = env["AMAP_WEBSERVICE_KEY"]
        self.process = subprocess.Popen(
            [npx, "-y", self.package],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=env,
        )
        assert self.process.stdout is not None
        threading.Thread(target=self._reader, args=(self.process.stdout,), daemon=True).start()
        self._initialize()
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()

    def _reader(self, stream: Any) -> None:
        for line in stream:
            self.lines.put(line.rstrip("\r\n"))
        self.lines.put(None)

    def _send(self, payload: dict[str, Any]) -> None:
        if not self.process or not self.process.stdin:
            raise MCPError("MCP process is not running")
        self.process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self.process.stdin.flush()

    def _receive_for_id(self, request_id: int) -> dict[str, Any]:
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            remaining = max(0.05, deadline - time.monotonic())
            try:
                line = self.lines.get(timeout=remaining)
            except queue.Empty as exc:
                raise MCPError(f"Timed out waiting for MCP response {request_id}") from exc
            if line is None:
                code = self.process.poll() if self.process else None
                raise MCPError(f"AMap MCP process exited before responding (code={code})")
            if not line.strip():
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise MCPError(json.dumps(message["error"], ensure_ascii=False))
            return message.get("result", {})
        raise MCPError(f"Timed out waiting for MCP response {request_id}")

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        request_id = self.next_id
        self.next_id += 1
        payload: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id, "method": method}
        if params is not None:
            payload["params"] = params
        self._send(payload)
        return self._receive_for_id(request_id)

    def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        payload: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        self._send(payload)

    def _initialize(self) -> None:
        self.request(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": CLIENT_NAME, "version": CLIENT_VERSION},
            },
        )
        self.notify("notifications/initialized")


def run_doctor(package: str, timeout: float) -> int:
    node = executable("node")
    npx = executable("npx")
    report: dict[str, Any] = {
        "node": {"available": bool(node), "version": None, "meets_minimum_22_14": False},
        "npx": {"available": bool(npx)},
        "package": package,
        "amap_key": "set" if key_is_set() else "missing",
        "mcp_initialization": "not_attempted",
    }
    if node:
        completed = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10)
        version_text = completed.stdout.strip() or completed.stderr.strip()
        version = parse_node_version(version_text)
        report["node"]["version"] = version_text
        report["node"]["meets_minimum_22_14"] = version >= (22, 14, 0)

    if not node or not npx or not report["node"]["meets_minimum_22_14"]:
        report["mcp_initialization"] = "blocked_by_runtime"
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    if not key_is_set():
        report["mcp_initialization"] = "blocked_by_missing_key"
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2

    try:
        with StdioMCPClient(package, timeout) as client:
            tools = client.request("tools/list").get("tools", [])
        report["mcp_initialization"] = "ok"
        report["tool_count"] = len(tools)
        report["tools"] = [tool.get("name") for tool in tools]
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        report["mcp_initialization"] = "failed"
        report["error"] = str(exc)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1


def require_key() -> None:
    if not key_is_set():
        raise MCPError("AMAP_MAPS_API_KEY is missing; create a Web Service key and export it before live MCP calls")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", default=os.environ.get("AMAP_MCP_PACKAGE", DEFAULT_PACKAGE))
    parser.add_argument("--timeout", type=float, default=30.0)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("doctor")
    subparsers.add_parser("list-tools")
    call_parser = subparsers.add_parser("call")
    call_parser.add_argument("tool")
    call_parser.add_argument("--arguments", default="{}", help="JSON object")
    args = parser.parse_args()

    if args.command == "doctor":
        return run_doctor(args.package, args.timeout)

    try:
        require_key()
        with StdioMCPClient(args.package, args.timeout) as client:
            if args.command == "list-tools":
                result = client.request("tools/list")
            else:
                arguments = json.loads(args.arguments)
                if not isinstance(arguments, dict):
                    raise MCPError("--arguments must decode to a JSON object")
                result = client.request("tools/call", {"name": args.tool, "arguments": arguments})
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (MCPError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
