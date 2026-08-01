#!/usr/bin/env python3
"""Render card-first HTML, Markdown and GeoJSON from trip.json."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from typing import Any


def load_json(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def safe_text(value: Any, default: str = "—") -> str:
    if value in (None, "", []):
        return default
    return str(value)


def duration_text(seconds: Any) -> str:
    if not isinstance(seconds, (int, float)):
        return "待核验"
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"{minutes} 分钟"
    return f"{minutes // 60} 小时 {minutes % 60} 分钟"


def distance_text(meters: Any) -> str:
    if not isinstance(meters, (int, float)):
        return "待核验"
    if meters < 1000:
        return f"{round(meters)} 米"
    return f"{meters / 1000:.1f} 公里"


def summary_markdown(data: dict[str, Any]) -> str:
    trip = data.get("trip", {})
    pois = {poi.get("id"): poi for poi in data.get("pois", [])}
    quality = data.get("quality", {})
    lines = [
        f"# {safe_text(trip.get('title'), '旅行计划')}",
        "",
        f"> 城市：{safe_text(trip.get('city'))} · 坐标系：{safe_text(trip.get('coordinate_system'))} · 状态：{safe_text(quality.get('status'), 'draft')}",
        "",
    ]
    assumptions = trip.get("assumptions") or []
    if assumptions:
        lines += ["## 当前假设", ""] + [f"- {item}" for item in assumptions] + [""]

    for day in data.get("days", []):
        window = day.get("window") or {}
        lines += [
            f"## Day {day.get('day_number')} · {safe_text(day.get('title'))}",
            "",
            f"时间窗：{safe_text(window.get('start'))}–{safe_text(window.get('end'))}",
            "",
        ]
        segments = day.get("route_segments") or []
        segment_by_pair = {(s.get("from_poi_id"), s.get("to_poi_id")): s for s in segments}
        assignments = sorted(day.get("assignments") or [], key=lambda item: item.get("order_index", 0))
        for index, assignment in enumerate(assignments):
            poi = pois.get(assignment.get("poi_id"), {})
            content = poi.get("content") or {}
            verification = poi.get("verification") or {}
            lines.append(f"### {index + 1}. {safe_text(poi.get('name'), assignment.get('poi_id'))}")
            lines.append("")
            lines.append(f"- 状态：{safe_text(verification.get('status'), 'candidate')}")
            lines.append(f"- 地址：{safe_text(poi.get('address'))}")
            lines.append(f"- 建议停留：{safe_text(content.get('stay_minutes'))} 分钟")
            lines.append(f"- 为什么看：{safe_text(content.get('why_visit'))}")
            watch_for = content.get("watch_for") or []
            if watch_for:
                lines.append(f"- 现场留意：{'；'.join(str(item) for item in watch_for)}")
            lines.append("")
            if index < len(assignments) - 1:
                next_id = assignments[index + 1].get("poi_id")
                segment = segment_by_pair.get((assignment.get("poi_id"), next_id), {})
                lines.append(
                    f"> 下一程：{safe_text(segment.get('mode'), '待定')} · {distance_text(segment.get('distance_m'))} · {duration_text(segment.get('duration_s'))} · {safe_text(segment.get('status'), 'pending')}"
                )
                lines.append("")

    warnings = quality.get("warnings") or []
    if warnings:
        lines += ["## 待确认", ""] + [f"- {warning}" for warning in warnings] + [""]
    lines += [
        "## 数据说明",
        "",
        "- 卡片、地图数据和本文档均由同一份 `trip.json` 生成。",
        "- 高德数据默认使用 GCJ-02；出发前请复核开放时间与临时预约规则。",
        "",
    ]
    return "\n".join(lines)


def geojson(data: dict[str, Any]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    poi_by_id = {poi.get("id"): poi for poi in data.get("pois", [])}
    for poi in data.get("pois", []):
        location = poi.get("location") or {}
        if not isinstance(location.get("lng"), (int, float)) or not isinstance(location.get("lat"), (int, float)):
            continue
        verification = poi.get("verification") or {}
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [location["lng"], location["lat"]]},
                "properties": {
                    "id": poi.get("id"),
                    "name": poi.get("name"),
                    "provider": poi.get("provider"),
                    "provider_poi_id": poi.get("provider_poi_id"),
                    "verification_status": verification.get("status"),
                    "coord_system": location.get("coord_system"),
                },
            }
        )
    for day in data.get("days", []):
        for segment in day.get("route_segments") or []:
            geometry = segment.get("geometry") or []
            if len(geometry) < 2:
                start = (poi_by_id.get(segment.get("from_poi_id")) or {}).get("location") or {}
                end = (poi_by_id.get(segment.get("to_poi_id")) or {}).get("location") or {}
                if all(isinstance(point.get(axis), (int, float)) for point in (start, end) for axis in ("lng", "lat")):
                    geometry = [[start["lng"], start["lat"]], [end["lng"], end["lat"]]]
            if len(geometry) >= 2:
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": geometry},
                        "properties": {
                            "day": day.get("day_number"),
                            "from": segment.get("from_poi_id"),
                            "to": segment.get("to_poi_id"),
                            "mode": segment.get("mode"),
                            "status": segment.get("status"),
                            "coord_system": data.get("trip", {}).get("coordinate_system"),
                        },
                    }
                )
    return {
        "type": "FeatureCollection",
        "name": data.get("trip", {}).get("title", "trip"),
        "properties": {
            "coordinate_system": data.get("trip", {}).get("coordinate_system"),
            "warning": "GeoJSON positions may be GCJ-02; convert before treating them as WGS84.",
        },
        "features": features,
    }


def html_document(data: dict[str, Any]) -> str:
    title = html.escape(safe_text(data.get("trip", {}).get("title"), "旅行计划"))
    embedded = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    template = r'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>__TITLE__</title>
  <style>
    :root{--ink:#172033;--muted:#64748b;--line:#dbe3ef;--blue:#1677ff;--soft:#f4f7fb;--warn:#b45309;--ok:#087f5b}
    *{box-sizing:border-box}body{margin:0;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--soft)}
    button{font:inherit}.shell{max-width:1480px;margin:auto;padding:24px}.hero{display:flex;gap:20px;justify-content:space-between;align-items:end;margin-bottom:18px}
    .eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);font-weight:750}.hero h1{margin:6px 0 4px;font-size:clamp(28px,4vw,52px);line-height:1}.meta{color:var(--muted)}
    .status{display:flex;gap:8px;flex-wrap:wrap}.pill{border:1px solid var(--line);background:white;border-radius:999px;padding:7px 11px;font-size:12px}
    .tabs{display:none;margin-bottom:12px}.tabs button{flex:1;padding:11px;border:1px solid var(--line);background:white}.tabs button.active{background:var(--ink);color:white}
    .layout{display:grid;grid-template-columns:minmax(330px,430px) minmax(420px,1fr);gap:18px;min-height:680px}.panel{background:white;border:1px solid var(--line);border-radius:20px;box-shadow:0 12px 40px #1e293b0d;overflow:hidden}
    .days{padding:16px;overflow:auto;max-height:calc(100vh - 150px)}.day{border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px}.day h2{font-size:18px;margin:0 0 3px}.day-sub{font-size:12px;color:var(--muted);margin-bottom:12px}
    .poi{display:grid;grid-template-columns:34px 1fr;gap:10px;border-radius:13px;padding:10px;cursor:pointer;transition:.15s}.poi:hover,.poi.active{background:#eef5ff}.num{width:30px;height:30px;border-radius:50%;background:var(--ink);color:white;display:grid;place-items:center;font-weight:750}.poi.active .num{background:var(--blue)}
    .poi h3{font-size:15px;margin:0 0 4px}.small{font-size:12px;color:var(--muted);line-height:1.55}.why{font-size:13px;line-height:1.6;margin-top:6px}.leg{margin:4px 0 4px 44px;border-left:2px dotted var(--line);padding:8px 0 8px 12px;font-size:12px;color:var(--muted)}
    .map-panel{display:grid;grid-template-rows:auto 1fr}.map-head{padding:16px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px}.map-head strong{font-size:14px}.map-head span{font-size:12px;color:var(--muted)}
    #map{min-height:600px;position:relative;background:radial-gradient(circle at 20% 20%,#fff 0 2px,transparent 3px),linear-gradient(145deg,#e9f1fb,#f7fafc);background-size:34px 34px,auto;overflow:hidden}
    #map svg{width:100%;height:100%;min-height:600px}.route{fill:none;stroke:var(--blue);stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.route.pending{stroke:#94a3b8;stroke-dasharray:9 8}.map-point{cursor:pointer}.map-point circle{fill:var(--ink);stroke:white;stroke-width:3}.map-point.active circle{fill:var(--blue);r:17}.map-point text{fill:white;font-weight:800;font-size:11px;text-anchor:middle;dominant-baseline:middle;pointer-events:none}
    .empty-map{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);text-align:center;padding:24px}.notice{position:absolute;left:16px;bottom:16px;background:#ffffffee;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:11px;color:var(--muted);max-width:320px}
    .warning{border-color:#fed7aa;background:#fff7ed;color:var(--warn);padding:10px;border-radius:12px;margin-top:10px;font-size:12px}
    @media(max-width:820px){.shell{padding:14px}.hero{display:block}.status{margin-top:12px}.tabs{display:flex}.layout{display:block;min-height:0}.panel{border-radius:16px}.days{max-height:none}.map-panel{display:none}.layout.show-map .days-panel{display:none}.layout.show-map .map-panel{display:grid}#map,#map svg{min-height:68vh}}
  </style>
</head>
<body>
<main class="shell">
  <header class="hero"><div><div class="eyebrow">AI Travel Planner</div><h1 id="title"></h1><div class="meta" id="meta"></div></div><div class="status" id="status"></div></header>
  <nav class="tabs"><button class="active" data-view="cards">卡片</button><button data-view="map">地图</button></nav>
  <section class="layout" id="layout"><article class="panel days-panel"><div class="days" id="days"></div></article><article class="panel map-panel"><div class="map-head"><strong id="map-title">路线示意</strong><span>点击地点与卡片双向定位</span></div><div id="map"></div></article></section>
</main>
<script id="trip-data" type="application/json">__DATA__</script>
<script>
const data=JSON.parse(document.getElementById('trip-data').textContent);const trip=data.trip||{};const quality=data.quality||{};const poiById=Object.fromEntries((data.pois||[]).map(p=>[p.id,p]));let selected=null;
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.getElementById('title').textContent=trip.title||'旅行计划';document.getElementById('meta').textContent=`${trip.city||'—'} · ${trip.coordinate_system||'—'} · ${trip.daily_window?.start||'—'}–${trip.daily_window?.end||'—'}`;
document.getElementById('status').innerHTML=`<span class="pill">${(data.days||[]).length} 天</span><span class="pill">${(data.pois||[]).length} 个 POI</span><span class="pill">${quality.unverified_poi_count||0} 待核验</span>`;
const daysEl=document.getElementById('days');
for(const day of data.days||[]){const ass=[...(day.assignments||[])].sort((a,b)=>a.order_index-b.order_index);const segs=Object.fromEntries((day.route_segments||[]).map(s=>[[s.from_poi_id,s.to_poi_id].join('→'),s]));const el=document.createElement('section');el.className='day';el.innerHTML=`<h2>Day ${day.day_number} · ${esc(day.title)}</h2><div class="day-sub">${esc(day.window?.start)}–${esc(day.window?.end)} · ${ass.length} 站</div>`;ass.forEach((a,i)=>{const p=poiById[a.poi_id]||{};const v=p.verification||{};const c=p.content||{};const card=document.createElement('div');card.className='poi';card.dataset.poi=a.poi_id;card.innerHTML=`<div class="num">${i+1}</div><div><h3>${esc(p.name||a.poi_id)}</h3><div class="small">${esc(p.address)} · ${esc(v.status||'candidate')} · ${esc(c.stay_minutes)} 分钟</div><div class="why">${esc(c.why_visit)}</div></div>`;card.onclick=()=>selectPoi(a.poi_id);el.appendChild(card);if(i<ass.length-1){const s=segs[`${a.poi_id}→${ass[i+1].poi_id}`]||{};const leg=document.createElement('div');leg.className='leg';const km=typeof s.distance_m==='number'?(s.distance_m<1000?`${Math.round(s.distance_m)} 米`:`${(s.distance_m/1000).toFixed(1)} 公里`):'距离待核验';const min=typeof s.duration_s==='number'?`${Math.round(s.duration_s/60)} 分钟`:'时间待核验';leg.textContent=`${s.mode||'待定'} · ${km} · ${min} · ${s.status||'pending'}`;el.appendChild(leg)}});if(!ass.length){el.innerHTML+='<div class="warning">尚未分配 POI；先完成研究与高德核验。</div>'}daysEl.appendChild(el)}
function allPoints(){return (data.pois||[]).filter(p=>Number.isFinite(p.location?.lng)&&Number.isFinite(p.location?.lat))}
function drawMap(){const host=document.getElementById('map');const pts=allPoints();if(!pts.length){host.innerHTML='<div class="empty-map">尚无已定位 POI<br>连接高德 MCP 后将显示真实点位</div><div class="notice">这是卡片产品骨架，不会用假坐标填充地图。</div>';return}const lngs=pts.map(p=>p.location.lng),lats=pts.map(p=>p.location.lat);const minX=Math.min(...lngs),maxX=Math.max(...lngs),minY=Math.min(...lats),maxY=Math.max(...lats);const px=x=>70+(x-minX)/(maxX-minX||1)*860,py=y=>530-(y-minY)/(maxY-minY||1)*450;const day=(data.days||[])[0]||{};const ordered=(day.assignments||[]).slice().sort((a,b)=>a.order_index-b.order_index).map(a=>poiById[a.poi_id]).filter(Boolean).filter(p=>pts.includes(p));let svg='<svg viewBox="0 0 1000 600" role="img" aria-label="路线示意图">';if(ordered.length>1){svg+=`<polyline class="route pending" points="${ordered.map(p=>`${px(p.location.lng)},${py(p.location.lat)}`).join(' ')}"/>`}pts.forEach((p,i)=>{const n=Math.max(1,ordered.indexOf(p)+1);svg+=`<g class="map-point" data-poi="${esc(p.id)}" transform="translate(${px(p.location.lng)},${py(p.location.lat)})"><circle r="14"></circle><text y="1">${n}</text></g>`});svg+='</svg><div class="notice">坐标驱动的路线示意；真实道路 geometry 需由高德 MCP/JSAPI 核验。</div>';host.innerHTML=svg;host.querySelectorAll('.map-point').forEach(el=>el.addEventListener('click',()=>selectPoi(el.dataset.poi)))}
function selectPoi(id){selected=id;document.querySelectorAll('[data-poi]').forEach(el=>el.classList.toggle('active',el.dataset.poi===id));const card=document.querySelector(`.poi[data-poi="${CSS.escape(id)}"]`);card?.scrollIntoView({behavior:'smooth',block:'center'})}drawMap();
document.querySelectorAll('.tabs button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x===btn));document.getElementById('layout').classList.toggle('show-map',btn.dataset.view==='map')});
</script>
</body></html>'''
    return template.replace("__TITLE__", title).replace("__DATA__", embedded)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    data = load_json(args.input)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "summary.md").write_text(summary_markdown(data), encoding="utf-8")
    (output / "trip.geojson").write_text(json.dumps(geojson(data), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "index.html").write_text(html_document(data), encoding="utf-8")
    print(json.dumps({"status": "ok", "outputs": [str((output / name).resolve()) for name in ("index.html", "summary.md", "trip.geojson")]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
