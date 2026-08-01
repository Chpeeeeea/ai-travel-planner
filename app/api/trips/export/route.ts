import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { tripToGeoJson, tripToMarkdown } from "../../../../platform/runtime/trip.mjs";
import { dataLayer, routeError } from "../../../../platform/server/planning-runtime";
import { assembleTrip } from "../../../../platform/server/trip-assembler";

function filename(value: string) {
  return value.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "travel-plan";
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to export this travel plan" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("run_id")?.trim() ?? "";
    const format = url.searchParams.get("format")?.trim().toLowerCase() ?? "markdown";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    if (!['markdown', 'geojson'].includes(format)) return Response.json({ error: "format must be markdown or geojson" }, { status: 400 });
    const { getDb, planningRuns } = await dataLayer();
    const [run] = await getDb().select({ id: planningRuns.id }).from(planningRuns)
      .where(and(eq(planningRuns.id, runId), eq(planningRuns.ownerUserId, user.userId)))
      .limit(1);
    if (!run) return Response.json({ error: "Travel plan not found" }, { status: 404 });
    const trip = await assembleTrip(runId);
    if (!trip) return Response.json({ error: "Travel plan not found" }, { status: 404 });
    const baseName = filename(trip.trip.title);
    if (format === "geojson") {
      return new Response(JSON.stringify(tripToGeoJson(trip), null, 2), {
        headers: {
          "content-type": "application/geo+json; charset=utf-8",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.geojson`)}`,
        },
      });
    }
    const markdown = `\uFEFF${tripToMarkdown(trip)}`;
    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.md`)}`,
      },
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
