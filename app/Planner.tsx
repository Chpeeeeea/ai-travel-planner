"use client";

import { useMemo, useState } from "react";

type Location = { lng: number; lat: number; coord_system: string } | null;
type Verification = { status: string; verified_at: string | null; match_confidence: number | null };
type Poi = {
  id: string;
  name: string;
  address: string;
  location: Location;
  themes?: string[];
  business: { rating: number | null; cost: number | null; open_hours: string | null };
  content: { why_visit: string; watch_for: string[]; stay_minutes: number };
  verification: Verification;
};
type Assignment = { poi_id: string; order_index: number; arrival_time: string | null; departure_time: string | null; notes: string };
type Segment = { from_poi_id: string; to_poi_id: string; mode: string; distance_m: number | null; duration_s: number | null; status: string };
type Day = { id: string; day_number: number; title: string; window: { start: string; end: string }; assignments: Assignment[]; route_segments: Segment[] };
type TripData = {
  trip: { title: string; city: string; assumptions: string[] };
  pois: Poi[];
  days: Day[];
  quality: { status: string; warnings: string[]; unverified_poi_count: number; verified_poi_count?: number; verified_route_count?: number };
  provenance: { research_documents?: string[]; updated_at: string };
};

const dayColors = ["#e4572e", "#247ba0", "#6a994e"];
const modeText: Record<string, string> = { walking: "步行", driving: "驾车", transit: "公交", bicycling: "骑行" };

function formatDistance(value: number | null) {
  if (value == null) return "待计算";
  return value < 1000 ? `${Math.round(value)} 米` : `${(value / 1000).toFixed(1)} 公里`;
}

function formatDuration(value: number | null) {
  if (value == null) return "待计算";
  const minutes = Math.round(value / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
}

function amapUrl(poi: Poi | undefined) {
  if (!poi?.location) return "#";
  const { lng, lat } = poi.location;
  return `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(poi.name)}&src=ai-travel-planner&coordinate=gaode&callnative=0`;
}

function mapPositions(pois: Poi[]) {
  const located = pois.filter((poi) => poi.location) as Array<Poi & { location: NonNullable<Location> }>;
  if (!located.length) return new Map<string, { x: number; y: number }>();
  const lngs = located.map((poi) => poi.location.lng);
  const lats = located.map((poi) => poi.location.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngRange = Math.max(maxLng - minLng, 0.008);
  const latRange = Math.max(maxLat - minLat, 0.008);
  return new Map(located.map((poi) => [poi.id, {
    x: 9 + ((poi.location.lng - minLng) / lngRange) * 82,
    y: 91 - ((poi.location.lat - minLat) / latRange) * 82,
  }]));
}

export default function Planner({ data }: { data: TripData }) {
  const [selectedDayId, setSelectedDayId] = useState(data.days[0]?.id ?? "");
  const [selectedPoiId, setSelectedPoiId] = useState(data.days[0]?.assignments[0]?.poi_id ?? "");
  const [theme, setTheme] = useState("全部");
  const [mobileView, setMobileView] = useState<"plan" | "map">("plan");

  const poiById = useMemo(() => new Map(data.pois.map((poi) => [poi.id, poi])), [data.pois]);
  const selectedDay = data.days.find((day) => day.id === selectedDayId) ?? data.days[0];
  const assignments = [...selectedDay.assignments].sort((a, b) => a.order_index - b.order_index);
  const dayPois = assignments.map((item) => poiById.get(item.poi_id)).filter(Boolean) as Poi[];
  const positions = mapPositions(dayPois);
  const selectedPoi = poiById.get(selectedPoiId);
  const assignedIds = useMemo(() => new Set(data.days.flatMap((day) => day.assignments.map((a) => a.poi_id))), [data.days]);
  const themes = ["全部", "历史", "文化", "风景", "美食"];
  const candidatePois = data.pois.filter((poi) => !assignedIds.has(poi.id) && (theme === "全部" || poi.themes?.includes(theme)));
  const routePoints = dayPois.map((poi) => positions.get(poi.id)).filter(Boolean) as Array<{ x: number; y: number }>;
  const totalDistance = selectedDay.route_segments.reduce((sum, item) => sum + (item.distance_m ?? 0), 0);
  const totalDuration = selectedDay.route_segments.reduce((sum, item) => sum + (item.duration_s ?? 0), 0);
  const color = dayColors[Math.max(0, selectedDay.day_number - 1) % dayColors.length];

  function chooseDay(day: Day) {
    setSelectedDayId(day.id);
    setSelectedPoiId(day.assignments[0]?.poi_id ?? "");
  }

  function downloadTrip() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "qingtian-trip.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">青</div>
          <div>
            <p className="eyebrow">AI TRAVEL PLANNER · LIVE DEMO</p>
            <h1>{data.trip.title}</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className="sync-state"><i /> 已同步 · {data.provenance.updated_at.slice(5, 16).replace("T", " ")}</span>
          <a className="ghost-button portfolio-link" href="/case-study">项目作品集</a>
          <button className="ghost-button" onClick={downloadTrip}>导出 trip.json</button>
        </div>
      </header>

      <section className="summary-strip" aria-label="数据状态">
        <div><strong>4</strong><span>并行研究线</span></div>
        <div><strong>{data.quality.verified_poi_count ?? data.pois.length - data.quality.unverified_poi_count}</strong><span>高德真实 POI</span></div>
        <div><strong>{data.quality.verified_route_count ?? 0}</strong><span>已计算路线</span></div>
        <div><strong>{data.quality.unverified_poi_count}</strong><span>候选待确认</span></div>
        <p>历史、文化、风景、美食各自研究；一份数据驱动卡片与地图。</p>
      </section>

      <nav className="day-tabs" aria-label="选择行程日期">
        {data.days.map((day, index) => (
          <button key={day.id} className={day.id === selectedDay.id ? "active" : ""} onClick={() => chooseDay(day)} style={{ "--day-color": dayColors[index] } as React.CSSProperties}>
            <span>DAY {day.day_number}</span>
            <strong>{day.title}</strong>
          </button>
        ))}
      </nav>

      <div className="mobile-switch" role="tablist" aria-label="移动端视图">
        <button className={mobileView === "plan" ? "active" : ""} onClick={() => setMobileView("plan")}>行程卡片</button>
        <button className={mobileView === "map" ? "active" : ""} onClick={() => setMobileView("map")}>路线地图</button>
      </div>

      <section className="workspace">
        <aside className={`plan-panel ${mobileView === "map" ? "mobile-hidden" : ""}`}>
          <div className="panel-head">
            <div><p className="eyebrow">TODAY&apos;S PLAN</p><h2>{selectedDay.title}</h2></div>
            <span>{assignments.length} 站</span>
          </div>
          <div className="day-metrics">
            <span>{selectedDay.window.start}–{selectedDay.window.end}</span>
            <span>{formatDistance(totalDistance)}</span>
            <span>通勤 {formatDuration(totalDuration)}</span>
          </div>
          <div className="timeline">
            {assignments.map((assignment, index) => {
              const poi = poiById.get(assignment.poi_id)!;
              const segment = selectedDay.route_segments.find((leg) => leg.from_poi_id === poi.id);
              const selected = poi.id === selectedPoiId;
              return (
                <div className="timeline-item" key={poi.id}>
                  <button className={`poi-card ${selected ? "selected" : ""}`} onClick={() => setSelectedPoiId(poi.id)} style={{ "--accent": color } as React.CSSProperties}>
                    <span className="stop-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="poi-main">
                      <span className="poi-time">{assignment.arrival_time}–{assignment.departure_time}</span>
                      <strong>{poi.name}</strong>
                      <small>{poi.address}</small>
                      <span className="theme-row">{poi.themes?.map((item) => <em key={item}>{item}</em>)}</span>
                      {selected && <span className="poi-detail">{poi.content.why_visit}</span>}
                    </span>
                    <span className="verified-dot" title="高德已核验">✓</span>
                  </button>
                  {segment && (
                    <div className="leg-row">
                      <span>{modeText[segment.mode] ?? segment.mode}</span>
                      <i />
                      <span>{formatDistance(segment.distance_m)}</span>
                      <span>{formatDuration(segment.duration_s)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <section className={`map-panel ${mobileView === "plan" ? "mobile-map-hidden" : ""}`}>
          <div className="map-toolbar">
            <div><p className="eyebrow">SPATIAL CHECK</p><h2>路线地图</h2></div>
            <div className="map-legend"><span className="route-swatch" style={{ background: color }} />Day {selectedDay.day_number}<span className="verified-label">GCJ-02 · 已核验坐标</span></div>
          </div>
          <div className="map-canvas" style={{ "--route": color } as React.CSSProperties}>
            <div className="terrain terrain-a" /><div className="terrain terrain-b" /><div className="river" />
            <span className="map-label label-a">青田县</span><span className="map-label label-b">瓯江水系</span>
            <svg className="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`Day ${selectedDay.day_number} 路线示意`}>
              <polyline points={routePoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <polyline points={routePoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {dayPois.map((poi, index) => {
              const point = positions.get(poi.id);
              if (!point) return null;
              return (
                <button key={poi.id} className={`map-marker ${poi.id === selectedPoiId ? "selected" : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%`, "--marker": color } as React.CSSProperties} onClick={() => setSelectedPoiId(poi.id)} aria-label={`选择 ${poi.name}`}>
                  {index + 1}<span>{poi.name}</span>
                </button>
              );
            })}
            <div className="map-note">本页以高德真实坐标绘制路线示意；道路 geometry 将在安全 JSAPI 模式中加载。</div>
          </div>
          <div className="selected-place">
            <div>
              <p>{selectedPoi?.themes?.join(" · ") ?? "候选地点"}</p>
              <h3>{selectedPoi?.name ?? "选择一个地点"}</h3>
              <span>{selectedPoi?.content.watch_for.slice(0, 2).join(" / ")}</span>
            </div>
            {selectedPoi?.location && <a href={amapUrl(selectedPoi)} target="_blank" rel="noreferrer">在高德打开 ↗</a>}
          </div>
        </section>

        <aside className="candidate-panel">
          <div className="panel-head">
            <div><p className="eyebrow">PLACE POOL</p><h2>候选地点池</h2></div>
            <span>{candidatePois.length}</span>
          </div>
          <div className="theme-filter">
            {themes.map((item) => <button key={item} className={theme === item ? "active" : ""} onClick={() => setTheme(item)}>{item}</button>)}
          </div>
          <div className="candidate-list">
            {candidatePois.map((poi) => (
              <button key={poi.id} className={`candidate-card ${poi.id === selectedPoiId ? "selected" : ""}`} onClick={() => setSelectedPoiId(poi.id)}>
                <span className={`status-badge ${poi.verification.status === "verified" ? "verified" : "pending"}`}>{poi.verification.status === "verified" ? "已核验" : "待确认"}</span>
                <strong>{poi.name}</strong>
                <small>{poi.content.why_visit}</small>
                <span className="candidate-meta">{poi.themes?.join(" · ")} · {poi.content.stay_minutes} 分钟</span>
              </button>
            ))}
          </div>
          <div className="research-stack">
            <p className="eyebrow">RESEARCH DOCS</p>
            {data.provenance.research_documents?.map((doc, index) => <div key={doc}><span>{String(index + 1).padStart(2, "0")}</span>{doc.replace(/^\d+-/, "")}</div>)}
          </div>
        </aside>
      </section>

      <footer className="warning-bar">
        <strong>出发前检查</strong><span>{data.quality.warnings[0]}</span><span>{data.quality.warnings[1]}</span>
      </footer>
    </main>
  );
}
