"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import AmapMap from "./AmapMap";
import type { Assignment, Day, Poi, TripData } from "./travelTypes";

const dayColors = ["#e4572e", "#247ba0", "#6a994e"];
const modeText: Record<string, string> = { walking: "步行", driving: "驾车", transit: "公交", bicycling: "骑行" };

function formatDistance(value: number | null) {
  if (value == null) return "实时计算";
  return value < 1000 ? `${Math.round(value)} 米` : `${(value / 1000).toFixed(1)} 公里`;
}

function formatDuration(value: number | null) {
  if (value == null) return "实时计算";
  const minutes = Math.round(value / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
}

function amapUrl(poi: Poi | undefined) {
  if (!poi?.location) return "#";
  const { lng, lat } = poi.location;
  return `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(poi.name)}&src=ai-travel-planner&coordinate=gaode&callnative=0`;
}

function insertionIndex(candidate: Poi, assignments: Assignment[], poiById: Map<string, Poi>) {
  if (!candidate.location || assignments.length < 2) return assignments.length;
  const points = assignments.map((item) => poiById.get(item.poi_id)).filter((poi): poi is Poi => Boolean(poi?.location));
  const distance = (a: Poi, b: Poi) => Math.hypot(
    (a.location!.lng - b.location!.lng) * 100,
    (a.location!.lat - b.location!.lat) * 111,
  );
  let bestIndex = assignments.length;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    const cost = (before ? distance(before, candidate) : 0)
      + (after ? distance(candidate, after) : 0)
      - (before && after ? distance(before, after) : 0);
    if (cost < bestCost) { bestCost = cost; bestIndex = index; }
  }
  return bestIndex;
}

function normalizeAssignments(items: Assignment[], clearTimes = false) {
  return items.map((item, index) => ({
    ...item,
    order_index: index,
    arrival_time: clearTimes ? null : item.arrival_time,
    departure_time: clearTimes ? null : item.departure_time,
  }));
}

export default function Planner({ data }: { data: TripData }) {
  const [days, setDays] = useState<Day[]>(data.days);
  const [selectedDayId, setSelectedDayId] = useState(data.days[0]?.id ?? "");
  const [selectedPoiId, setSelectedPoiId] = useState(data.days[0]?.assignments[0]?.poi_id ?? "");
  const [expandedPoiIds, setExpandedPoiIds] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState("全部");
  const [mobileView, setMobileView] = useState<"plan" | "map" | "discover">("plan");
  const [routeRevision, setRouteRevision] = useState(0);
  const [customizedDays, setCustomizedDays] = useState<Set<string>>(new Set());
  const [liveRouteSummary, setLiveRouteSummary] = useState<Record<string, { distance: number; duration: number; complete: boolean }>>({});

  const poiById = useMemo(() => new Map(data.pois.map((poi) => [poi.id, poi])), [data.pois]);
  const selectedDay = useMemo(() => days.find((day) => day.id === selectedDayId) ?? days[0], [days, selectedDayId]);
  const assignments = useMemo(() => [...selectedDay.assignments].sort((a, b) => a.order_index - b.order_index), [selectedDay.assignments]);
  const dayPois = useMemo(() => assignments.map((item) => poiById.get(item.poi_id)).filter((poi): poi is Poi => Boolean(poi)), [assignments, poiById]);
  const assignedIds = useMemo(() => new Set(days.flatMap((day) => day.assignments.map((item) => item.poi_id))), [days]);
  const themes = ["全部", "历史", "文化", "风景", "美食"];
  const candidatePois = useMemo(
    () => data.pois.filter((poi) => !assignedIds.has(poi.id) && (theme === "全部" || poi.themes?.includes(theme))),
    [assignedIds, data.pois, theme],
  );
  const selectedPoi = poiById.get(selectedPoiId);
  const color = dayColors[Math.max(0, selectedDay.day_number - 1) % dayColors.length];
  const staticDistance = selectedDay.route_segments.reduce((sum, item) => sum + (item.distance_m ?? 0), 0);
  const staticDuration = selectedDay.route_segments.reduce((sum, item) => sum + (item.duration_s ?? 0), 0);
  const live = liveRouteSummary[selectedDay.id];
  const totalDistance = live?.distance || staticDistance;
  const totalDuration = live?.duration || staticDuration;

  const selectPoi = useCallback((poiId: string) => setSelectedPoiId(poiId), []);
  const updateRouteSummary = useCallback((summary: { distance: number; duration: number; complete: boolean }) => {
    setLiveRouteSummary((current) => {
      const before = current[selectedDay.id];
      if (before && before.distance === summary.distance && before.duration === summary.duration && before.complete === summary.complete) return current;
      return { ...current, [selectedDay.id]: summary };
    });
  }, [selectedDay.id]);

  function chooseDay(day: Day) {
    setSelectedDayId(day.id);
    setSelectedPoiId(day.assignments[0]?.poi_id ?? "");
  }

  function toggleDetails(poiId: string) {
    setExpandedPoiIds((current) => {
      const next = new Set(current);
      if (next.has(poiId)) next.delete(poiId); else next.add(poiId);
      return next;
    });
    setSelectedPoiId(poiId);
  }

  function customizeDay(transform: (items: Assignment[]) => Assignment[]) {
    setDays((current) => current.map((day) => day.id === selectedDay.id
      ? { ...day, assignments: normalizeAssignments(transform([...day.assignments].sort((a, b) => a.order_index - b.order_index)), true), route_segments: [] }
      : day));
    setCustomizedDays((current) => new Set(current).add(selectedDay.id));
    setRouteRevision((value) => value + 1);
  }

  function addCandidate(poi: Poi) {
    if (!poi.location) return;
    const index = insertionIndex(poi, assignments, poiById);
    const assignment: Assignment = {
      poi_id: poi.id,
      order_index: index,
      arrival_time: null,
      departure_time: null,
      locked: false,
      notes: "自定义加入，时间将根据最终路线调整",
    };
    customizeDay((items) => [...items.slice(0, index), assignment, ...items.slice(index)]);
    setSelectedPoiId(poi.id);
    setExpandedPoiIds((current) => new Set(current).add(poi.id));
  }

  function movePoi(poiId: string, direction: -1 | 1) {
    customizeDay((items) => {
      const index = items.findIndex((item) => item.poi_id === poiId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      [items[index], items[target]] = [items[target], items[index]];
      return items;
    });
  }

  function removePoi(poiId: string) {
    customizeDay((items) => items.filter((item) => item.poi_id !== poiId));
    const nextPoi = dayPois.find((poi) => poi.id !== poiId);
    setSelectedPoiId(nextPoi?.id ?? "");
  }

  function resetDay() {
    const original = data.days.find((day) => day.id === selectedDay.id);
    if (!original) return;
    setDays((current) => current.map((day) => day.id === original.id ? original : day));
    setCustomizedDays((current) => { const next = new Set(current); next.delete(original.id); return next; });
    setSelectedPoiId(original.assignments[0]?.poi_id ?? "");
    setRouteRevision((value) => value + 1);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">青</div>
          <div><p className="eyebrow">AI TRAVEL PLANNER</p><h1>{data.trip.title}</h1></div>
        </div>
        <div className="header-actions">
          <span className="sync-state"><i /> 路线服务已连接</span>
          <Link className="ghost-button portfolio-link" href="/summary">行程摘要</Link>
          <Link className="ghost-button portfolio-link" href="/case-study">产品介绍</Link>
        </div>
      </header>

      <section className="summary-strip" aria-label="行程概览">
        <div><strong>3</strong><span>天行程</span></div>
        <div><strong>{data.quality.verified_poi_count ?? 21}</strong><span>精选地点</span></div>
        <div><strong>4</strong><span>兴趣主题</span></div>
        <div><strong>实时</strong><span>道路刷新</span></div>
        <p>在卡片或地图中选择地点，加入、移除或调整顺序，路线会重新计算。</p>
      </section>

      <nav className="day-tabs" aria-label="选择行程日期">
        {days.map((day, index) => (
          <button key={day.id} className={day.id === selectedDay.id ? "active" : ""} onClick={() => chooseDay(day)} style={{ "--day-color": dayColors[index] } as React.CSSProperties}>
            <span>DAY {day.day_number}</span><strong>{day.title}</strong>
          </button>
        ))}
      </nav>

      <div className="mobile-switch" role="tablist" aria-label="移动端视图">
        <button className={mobileView === "plan" ? "active" : ""} onClick={() => setMobileView("plan")}>行程卡片</button>
        <button className={mobileView === "map" ? "active" : ""} onClick={() => setMobileView("map")}>路线地图</button>
        <button className={mobileView === "discover" ? "active" : ""} onClick={() => setMobileView("discover")}>候选地点</button>
      </div>

      <section className="workspace">
        <aside className={`plan-panel ${mobileView !== "plan" ? "responsive-hidden" : ""}`}>
          <div className="panel-head">
            <div><p className="eyebrow">TODAY&apos;S PLAN</p><h2>{selectedDay.title}</h2></div>
            <span>{assignments.length} 站</span>
          </div>
          <div className="day-metrics">
            <span>{customizedDays.has(selectedDay.id) ? "自定义行程" : `${selectedDay.window.start}–${selectedDay.window.end}`}</span>
            <span>{formatDistance(totalDistance)}</span><span>通勤 {formatDuration(totalDuration)}</span>
            {customizedDays.has(selectedDay.id) && <button onClick={resetDay}>恢复默认</button>}
          </div>
          <div className="timeline">
            {assignments.map((assignment, index) => {
              const poi = poiById.get(assignment.poi_id)!;
              const segment = selectedDay.route_segments.find((leg) => leg.from_poi_id === poi.id);
              const expanded = expandedPoiIds.has(poi.id);
              return (
                <div className="timeline-item" key={poi.id}>
                  <article className={`poi-card-shell ${poi.id === selectedPoiId ? "selected" : ""}`} style={{ "--accent": color } as React.CSSProperties}>
                    <button className="poi-card" onClick={() => selectPoi(poi.id)}>
                      <span className="stop-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="poi-main">
                        <span className="poi-time">{assignment.arrival_time && assignment.departure_time ? `${assignment.arrival_time}–${assignment.departure_time}` : "时间待排"}</span>
                        <strong>{poi.name}</strong><small>{poi.address}</small>
                        <span className="theme-row">{poi.themes?.map((item) => <em key={item}>{item}</em>)}</span>
                      </span>
                      <span className="verified-dot" title="高德已核验">✓</span>
                    </button>
                    <div className="poi-card-actions">
                      <button onClick={() => toggleDetails(poi.id)}>{expanded ? "收起简介" : "查看简介"}</button>
                      <button onClick={() => movePoi(poi.id, -1)} disabled={index === 0} aria-label="上移">↑</button>
                      <button onClick={() => movePoi(poi.id, 1)} disabled={index === assignments.length - 1} aria-label="下移">↓</button>
                      <button onClick={() => removePoi(poi.id)}>移除</button>
                    </div>
                    {expanded && (
                      <div className="poi-expand">
                        <p>{poi.content.why_visit}</p>
                        <dl><div><dt>建议停留</dt><dd>{poi.content.stay_minutes} 分钟</dd></div><div><dt>开放提示</dt><dd>{poi.business.open_hours ?? "出发前确认"}</dd></div></dl>
                        <strong>到现场看什么</strong>
                        <ul>{poi.content.watch_for.map((item) => <li key={item}>{item}</li>)}</ul>
                        {assignment.notes && <small>安排说明：{assignment.notes}</small>}
                      </div>
                    )}
                  </article>
                  {index < assignments.length - 1 && (
                    <div className="leg-row"><span>{segment ? modeText[segment.mode] ?? segment.mode : "实时道路"}</span><i /><span>{segment ? formatDistance(segment.distance_m) : "重新计算中"}</span><span>{segment ? formatDuration(segment.duration_s) : ""}</span></div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <section className={`map-panel ${mobileView !== "map" ? "responsive-hidden" : ""}`}>
          <div className="map-toolbar">
            <div><p className="eyebrow">LIVE ROUTE</p><h2>真实道路地图</h2></div>
            <div className="map-legend"><span className="route-swatch" style={{ background: color }} />Day {selectedDay.day_number}<span className="verified-label">高德 JSAPI · GCJ-02</span></div>
          </div>
          <AmapMap
            dayPois={dayPois}
            candidatePois={candidatePois}
            segments={selectedDay.route_segments}
            selectedPoiId={selectedPoiId}
            color={color}
            revision={routeRevision}
            researchArea={data.trip.map_view}
            researchAreaName={data.trip.city}
            onSelect={selectPoi}
            onRouteSummary={updateRouteSummary}
          />
          <div className="selected-place">
            <div><p>{selectedPoi?.themes?.join(" · ") ?? "选择地点"}</p><h3>{selectedPoi?.name ?? "点击地图或卡片"}</h3><span>{selectedPoi?.content.why_visit ?? "查看地点介绍和安排原因"}</span></div>
            <div className="selected-actions">
              {selectedPoi && !assignedIds.has(selectedPoi.id) && <button disabled={!selectedPoi.location} onClick={() => addCandidate(selectedPoi)}>{selectedPoi.location ? `加入 Day ${selectedDay.day_number}` : "位置待确认"}</button>}
              {selectedPoi?.location && <a href={amapUrl(selectedPoi)} target="_blank" rel="noreferrer">高德导航 ↗</a>}
            </div>
          </div>
        </section>

        <aside className={`candidate-panel ${mobileView !== "discover" ? "responsive-hidden" : ""}`}>
          <div className="panel-head"><div><p className="eyebrow">DISCOVER</p><h2>候选地点</h2></div><span>{candidatePois.length}</span></div>
          <div className="theme-filter">{themes.map((item) => <button key={item} className={theme === item ? "active" : ""} onClick={() => setTheme(item)}>{item}</button>)}</div>
          <div className="candidate-list">
            {candidatePois.map((poi) => (
              <article key={poi.id} className={`candidate-card ${poi.id === selectedPoiId ? "selected" : ""}`}>
                <button className="candidate-select" onClick={() => selectPoi(poi.id)}>
                  <span className={`status-badge ${poi.location ? "verified" : "pending"}`}>{poi.location ? "地图可见" : "位置待确认"}</span>
                  <strong>{poi.name}</strong><small>{poi.content.why_visit}</small><span className="candidate-meta">{poi.themes?.join(" · ")} · {poi.content.stay_minutes} 分钟</span>
                </button>
                <button className="candidate-add" disabled={!poi.location} onClick={() => addCandidate(poi)}>{poi.location ? `智能插入 Day ${selectedDay.day_number}` : "核验坐标后可加入"}</button>
              </article>
            ))}
          </div>
          <div className="route-editor-help"><strong>自定义路线</strong><p>候选点会显示为地图上的“＋”。加入后系统选择绕行较少的位置；也可在左侧上移、下移或移除，真实道路随即刷新。</p></div>
        </aside>
      </section>

      <footer className="warning-bar"><strong>出发前检查</strong><span>{data.quality.warnings[0]}</span><span>{data.quality.warnings[1]}</span></footer>
    </main>
  );
}
