import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { dataLayer, routeError } from "../../../../platform/server/planning-runtime";
import { assembleTrip } from "../../../../platform/server/trip-assembler";

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
    const trip = await assembleTrip(runId);
    return trip ? Response.json(trip) : Response.json({ error: "Travel plan not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
