import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { dataLayer, routeError, runtimeSecrets } from "../../../../platform/server/planning-runtime";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to view this travel plan" }, { status: 401 });
  try {
    const runId = new URL(request.url).searchParams.get("run_id")?.trim() ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { getDb, planningRuns } = await dataLayer();
    const [run] = await getDb().select({ id: planningRuns.id }).from(planningRuns)
      .where(and(eq(planningRuns.id, runId), eq(planningRuns.ownerUserId, user.userId)))
      .limit(1);
    if (!run) return Response.json({ error: "Travel plan not found" }, { status: 404 });
    const token = (await runtimeSecrets()).PLANNING_RUN_WRITE_TOKEN;
    if (!token) return Response.json({ error: "Planning service is not configured" }, { status: 503 });
    const upstreamUrl = new URL("/api/planning-runs/trip", request.url);
    upstreamUrl.searchParams.set("run_id", runId);
    const upstream = await fetch(upstreamUrl, { headers: { authorization: `Bearer ${token}` } });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8" },
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
