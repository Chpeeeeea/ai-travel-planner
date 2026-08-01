import { runtimeSecrets } from "./planning-runtime";

const AMAP_BASE = "https://restapi.amap.com";
const FATAL_CODES = new Set(["10001", "10005", "10006", "10007", "10009", "10012", "10013"]);
const RETRYABLE_CODES = new Set(["10003", "10004", "10010", "10014", "10016", "10019", "10020", "10021"]);

export class AmapProviderError extends Error {
  code: string;
  fatal: boolean;
  retryable: boolean;

  constructor(message: string, code = "AMAP_ERROR") {
    super(message);
    this.name = "AmapProviderError";
    this.code = code;
    this.fatal = FATAL_CODES.has(code);
    this.retryable = RETRYABLE_CODES.has(code) || code === "NETWORK_ERROR";
  }
}

export async function amapWebServiceKey() {
  const secrets = await runtimeSecrets();
  const key = secrets.AMAP_WEBSERVICE_KEY || secrets.AMAP_MAPS_API_KEY;
  if (!key) throw new AmapProviderError("AMap Web Service key is not configured", "MISSING_KEY");
  return key;
}

async function amapRequest(path: string, parameters: Record<string, string | number | boolean | null | undefined>) {
  const key = await amapWebServiceKey();
  const url = new URL(path, AMAP_BASE);
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(name, String(value));
  }
  url.searchParams.set("key", key);
  url.searchParams.set("output", "json");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ai-travel-planner-platform/0.8" },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new AmapProviderError("AMap network request failed", "NETWORK_ERROR");
  }
  if (!response.ok) throw new AmapProviderError(`AMap HTTP ${response.status}`, `HTTP_${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const status = String(payload.status ?? "");
  const code = String(payload.infocode ?? payload.errcode ?? "AMAP_ERROR");
  if (status !== "1" || (code && code !== "10000")) {
    throw new AmapProviderError(String(payload.info ?? payload.errmsg ?? "AMap request failed"), code);
  }
  return payload;
}

export async function searchAmapPlaces(keywords: string, region: string) {
  return amapRequest("/v5/place/text", {
    keywords: keywords.slice(0, 80),
    region,
    city_limit: true,
    page_size: 5,
    page_num: 1,
    show_fields: "business,navi",
  });
}

export type AmapRouteMode = "walking" | "driving" | "bicycling";

export async function requestAmapRoute(input: {
  mode: AmapRouteMode;
  origin: { lng: number; lat: number; providerPoiId?: string | null };
  destination: { lng: number; lat: number; providerPoiId?: string | null };
}) {
  const path = `/v5/direction/${input.mode}`;
  return amapRequest(path, {
    origin: `${input.origin.lng.toFixed(6)},${input.origin.lat.toFixed(6)}`,
    destination: `${input.destination.lng.toFixed(6)},${input.destination.lat.toFixed(6)}`,
    origin_id: input.origin.providerPoiId,
    destination_id: input.destination.providerPoiId,
    strategy: input.mode === "driving" ? 32 : undefined,
    alternative_route: input.mode === "driving" ? undefined : 1,
    show_fields: "cost,polyline,navi",
  });
}
