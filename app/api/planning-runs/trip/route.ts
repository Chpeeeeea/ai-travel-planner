import { deny, routeError } from "../../../../platform/server/planning-runtime";
import { assembleTrip } from "../../../../platform/server/trip-assembler";

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const runId = new URL(request.url).searchParams.get("run_id")?.trim() ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const trip = await assembleTrip(runId);
    return trip
      ? Response.json(trip)
      : Response.json({ error: "PlanningRun not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
