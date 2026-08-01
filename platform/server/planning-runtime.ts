export const stageOrder = ["brief", "researching", "shortlisted", "verifying", "scheduled", "routing", "published"] as const;
export type RunStage = typeof stageOrder[number];

export async function runtimeSecrets() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as {
    PLANNING_RUN_WRITE_TOKEN?: string;
    AMAP_WEBSERVICE_KEY?: string;
    AMAP_MAPS_API_KEY?: string;
  };
}

export async function dataLayer() {
  const [{ getDb }, schema] = await Promise.all([import("../../db"), import("../../db/schema")]);
  return { getDb, ...schema };
}

export async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(request: Request) {
  const expected = (await runtimeSecrets()).PLANNING_RUN_WRITE_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  return await digest(expected) === await digest(supplied);
}

export async function deny(request: Request) {
  if (!(await runtimeSecrets()).PLANNING_RUN_WRITE_TOKEN) {
    return Response.json({ error: "PlanningRun API is not configured" }, { status: 503 });
  }
  return await authorized(request) ? null : Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "PlanningRun tables are unavailable; apply the generated D1 migration first.";
  return message;
}

export function parseJsonList(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
