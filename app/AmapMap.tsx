"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- AMap JSAPI is loaded dynamically and has no bundled project types. */

import { useEffect, useRef, useState } from "react";
import type { MapView, Poi, Segment } from "./travelTypes";

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

type RouteSummary = { distance: number; duration: number; complete: boolean };
type MapLayerMode = "road" | "satellite";
type Props = {
  dayPois: Poi[];
  candidatePois: Poi[];
  segments: Segment[];
  selectedPoiId: string;
  color: string;
  revision: number;
  researchArea?: MapView;
  onSelect: (poiId: string) => void;
  onRouteSummary: (summary: RouteSummary) => void;
};

let loaderPromise: Promise<any> | null = null;

async function loadAmap() {
  if (window.AMap) return window.AMap;
  if (loaderPromise) return loaderPromise;
  loaderPromise = fetch("/api/amap-config")
    .then(async (response) => {
      if (!response.ok) throw new Error("地图服务尚未配置");
      const config = await response.json() as { key?: string };
      if (!config.key) throw new Error("地图服务尚未配置");
      window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/_AMapService` };
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.key!)}`;
        script.async = true;
        script.onload = () => resolve(window.AMap);
        script.onerror = () => reject(new Error("高德地图加载失败"));
        document.head.appendChild(script);
      });
    })
    .catch((error) => {
      loaderPromise = null;
      throw error;
    });
  return loaderPromise;
}

function routeMode(from: Poi, to: Poi, segments: Segment[]) {
  const known = segments.find((item) => item.from_poi_id === from.id && item.to_poi_id === to.id)?.mode;
  if (known === "walking" || known === "driving") return known;
  if (!from.location || !to.location) return "driving";
  const dx = (from.location.lng - to.location.lng) * 100;
  const dy = (from.location.lat - to.location.lat) * 111;
  return Math.hypot(dx, dy) < 2.2 ? "walking" : "driving";
}

function searchRoute(AMap: any, mode: string, from: Poi, to: Poi) {
  return new Promise<{ path: any[]; distance: number; duration: number } | null>((resolve) => {
    const Service = mode === "walking" ? AMap.Walking : AMap.Driving;
    const service = new Service({ policy: 0, hideMarkers: true, autoFitView: false });
    service.search(
      [from.location!.lng, from.location!.lat],
      [to.location!.lng, to.location!.lat],
      (status: string, result: any) => {
        if (status !== "complete" || !result?.routes?.[0]) return resolve(null);
        const route = result.routes[0];
        const path = (route.steps ?? []).flatMap((step: any) => step.path ?? []);
        resolve({ path, distance: Number(route.distance ?? 0), duration: Number(route.time ?? 0) });
      },
    );
  });
}

function containerIsVisible(container: HTMLDivElement | null) {
  return Boolean(container && container.clientWidth > 1 && container.clientHeight > 1);
}

function applyResearchViewport(AMap: any, map: any, container: HTMLDivElement | null, researchArea?: MapView) {
  if (!researchArea?.bounds || !containerIsVisible(container)) return false;
  const bounds = new AMap.Bounds(
    [researchArea.bounds.southwest.lng, researchArea.bounds.southwest.lat],
    [researchArea.bounds.northeast.lng, researchArea.bounds.northeast.lat],
  );
  map.setBounds(bounds, false, [56, 56, 56, 56]);
  return true;
}

function zoomToPoi(map: any, poi: Poi) {
  if (!poi.location) return;
  const currentZoom = Number(map.getZoom?.() ?? 12);
  const targetZoom = Math.min(18, Math.max(16, currentZoom + 2));
  map.setZoomAndCenter(targetZoom, [poi.location.lng, poi.location.lat], false, 320);
}

export default function AmapMap({ dayPois, candidatePois, segments, selectedPoiId, color, revision, researchArea, onSelect, onRouteSummary }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const baseLayersRef = useRef<{ road: any; satellite: any; roadNet: any } | null>(null);
  const overlaysRef = useRef<any[]>([]);
  const initialViewportAppliedRef = useRef(false);
  const initialRouteDrawCompletedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [layerMode, setLayerMode] = useState<MapLayerMode>("road");
  const [routeState, setRouteState] = useState<"loading" | "ready" | "drawing" | "error">("loading");
  const [message, setMessage] = useState("正在加载真实道路地图…");

  useEffect(() => {
    let cancelled = false;
    loadAmap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        const road = AMap.createDefaultLayer({ zooms: [3, 20] });
        const satellite = new AMap.TileLayer.Satellite({ zooms: [3, 20] });
        const roadNet = new AMap.TileLayer.RoadNet({ zooms: [3, 20] });
        baseLayersRef.current = { road, satellite, roadNet };
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: researchArea?.zoom ?? 11,
          center: researchArea ? [researchArea.center.lng, researchArea.center.lat] : [120.286, 28.135],
          viewMode: "2D",
          resizeEnable: true,
          layers: [road],
          mapStyle: "amap://styles/whitesmoke",
        });
        AMap.plugin("AMap.ToolBar", () => mapRef.current?.addControl(new AMap.ToolBar({ position: "RB" })));
        setMapReady(true);
        setRouteState("ready");
      })
      .catch((error) => {
        if (!cancelled) {
          setRouteState("error");
          setMessage(error instanceof Error ? error.message : "地图服务暂时不可用");
        }
      });
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      baseLayersRef.current = null;
    };
  }, [researchArea]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !baseLayersRef.current) return;
    const { road, satellite, roadNet } = baseLayersRef.current;
    mapRef.current.setLayers(layerMode === "satellite" ? [satellite, roadNet] : [road]);
  }, [layerMode, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.AMap || !containerRef.current) return;
    const container = containerRef.current;
    const map = mapRef.current;
    const syncVisibleMap = () => {
      if (!containerIsVisible(container)) return;
      map.resize();
      if (!initialViewportAppliedRef.current) {
        initialViewportAppliedRef.current = applyResearchViewport(window.AMap, map, container, researchArea);
      }
    };

    syncVisibleMap();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncVisibleMap);
    observer.observe(container);
    return () => observer.disconnect();
  }, [mapReady, researchArea]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.AMap) return;
    let cancelled = false;
    const AMap = window.AMap;
    const map = mapRef.current;
    map.remove(overlaysRef.current);
    overlaysRef.current = [];
    setRouteState("drawing");
    setMessage("正在按当前顺序计算真实道路…");

    const dayMarkers = dayPois.filter((poi) => poi.location).map((poi, index) => {
      const marker = new AMap.Marker({
        position: [poi.location!.lng, poi.location!.lat],
        title: poi.name,
        zIndex: 160,
        content: `<button class="amap-product-marker" data-poi-id="${poi.id}" style="--marker:${color}" aria-label="${poi.name}">${index + 1}</button>`,
        offset: new AMap.Pixel(-17, -17),
      });
      marker.on("click", () => onSelect(poi.id));
      marker.on("dblclick", () => {
        onSelect(poi.id);
        zoomToPoi(map, poi);
      });
      return marker;
    });

    const candidateMarkers = candidatePois.filter((poi) => poi.location).map((poi) => {
      const marker = new AMap.Marker({
        position: [poi.location!.lng, poi.location!.lat],
        title: `候选：${poi.name}`,
        zIndex: 110,
        content: `<button class="amap-candidate-marker" data-poi-id="${poi.id}" aria-label="候选地点 ${poi.name}">＋</button>`,
        offset: new AMap.Pixel(-15, -15),
      });
      marker.on("click", () => onSelect(poi.id));
      marker.on("dblclick", () => {
        onSelect(poi.id);
        zoomToPoi(map, poi);
      });
      return marker;
    });

    const markers = [...dayMarkers, ...candidateMarkers];
    map.add(markers);
    overlaysRef.current = markers;

    AMap.plugin(["AMap.Driving", "AMap.Walking"], async () => {
      let distance = 0;
      let duration = 0;
      let complete = true;
      const lines: any[] = [];

      for (let index = 0; index < dayPois.length - 1; index += 1) {
        if (cancelled) return;
        const from = dayPois[index];
        const to = dayPois[index + 1];
        if (!from.location || !to.location) continue;
        const result = await searchRoute(AMap, routeMode(from, to, segments), from, to);
        const path = result?.path?.length ? result.path : [
          [from.location.lng, from.location.lat],
          [to.location.lng, to.location.lat],
        ];
        if (result) {
          distance += result.distance;
          duration += result.duration;
        } else {
          complete = false;
        }
        lines.push(new AMap.Polyline({
          path,
          strokeColor: color,
          strokeWeight: 6,
          strokeOpacity: .88,
          strokeStyle: result ? "solid" : "dashed",
          lineJoin: "round",
          lineCap: "round",
          showDir: true,
          zIndex: 120,
        }));
      }

      if (cancelled) return;
      map.add(lines);
      overlaysRef.current = [...markers, ...lines];
      const routeOverlays = [...dayMarkers, ...lines];
      if (!initialRouteDrawCompletedRef.current) {
        if (!initialViewportAppliedRef.current) {
          initialViewportAppliedRef.current = applyResearchViewport(AMap, map, containerRef.current, researchArea);
        }
        initialRouteDrawCompletedRef.current = true;
      } else if (routeOverlays.length && initialViewportAppliedRef.current) {
        map.setFitView(routeOverlays, false, [72, 72, 72, 72], 16);
      }
      onRouteSummary({ distance, duration, complete });
      setRouteState("ready");
      setMessage(complete ? "真实道路已刷新" : "部分路段暂时无法计算");
    });

    return () => { cancelled = true; };
  }, [candidatePois, color, dayPois, mapReady, onRouteSummary, onSelect, researchArea, revision, segments]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll<HTMLElement>("[data-poi-id]").forEach((node) => {
      node.classList.toggle("is-selected", node.dataset.poiId === selectedPoiId);
    });
  }, [mapReady, revision, selectedPoiId]);

  function focusResearchArea() {
    if (!mapRef.current || !window.AMap || !containerRef.current) return;
    mapRef.current.resize();
    if (applyResearchViewport(window.AMap, mapRef.current, containerRef.current, researchArea)) {
      initialViewportAppliedRef.current = true;
      setMessage("已返回青田县研究区");
    }
  }

  return (
    <div className="amap-shell">
      <div ref={containerRef} className="amap-container" aria-label="高德真实道路地图" />
      <div className={`map-service-state ${routeState}`}><i />{message}</div>
      <div className="map-display-controls">
        <div className="map-layer-switch" role="group" aria-label="切换地图图层">
          <button className={layerMode === "road" ? "active" : ""} onClick={() => setLayerMode("road")} aria-pressed={layerMode === "road"}>道路</button>
          <button className={layerMode === "satellite" ? "active" : ""} onClick={() => setLayerMode("satellite")} aria-pressed={layerMode === "satellite"}>遥感</button>
          <button onClick={focusResearchArea} title="返回旅行研究区">研究区</button>
        </div>
        <div className="candidate-map-legend"><span>● 行程</span><span>＋ 可加入候选点</span><span>双击点位放大</span></div>
      </div>
    </div>
  );
}
