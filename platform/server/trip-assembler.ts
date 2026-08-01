import { asc, eq } from "drizzle-orm";
import { buildTripDocument } from "../runtime/trip.mjs";
import { dataLayer } from "./planning-runtime";

export async function assembleTrip(runId: string) {
  const { assignments, candidates, getDb, itineraryDays, planningBriefs, planningRuns, providerMatches, researchEvidence, routeSegments } = await dataLayer();
  const db = getDb();
  const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
  if (!run) return null;
  const [briefRow, candidateRows, matchRows, dayRows, evidenceRows] = await Promise.all([
    db.select().from(planningBriefs).where(eq(planningBriefs.runId, runId)).limit(1).then((items) => items[0]),
    db.select().from(candidates).where(eq(candidates.runId, runId)).orderBy(asc(candidates.shortlistRank)),
    db.select().from(providerMatches).where(eq(providerMatches.runId, runId)),
    db.select().from(itineraryDays).where(eq(itineraryDays.runId, runId)).orderBy(asc(itineraryDays.dayNumber)),
    db.select().from(researchEvidence).where(eq(researchEvidence.runId, runId)),
  ]);
  const assignmentRows = (await Promise.all(dayRows.map((day) =>
    db.select().from(assignments).where(eq(assignments.dayId, day.id)).orderBy(asc(assignments.orderIndex))))).flat();
  const segmentRows = (await Promise.all(dayRows.map((day) =>
    db.select().from(routeSegments).where(eq(routeSegments.dayId, day.id))))).flat();
  return buildTripDocument({
    run,
    brief: briefRow ? JSON.parse(briefRow.briefJson) : {},
    candidates: candidateRows,
    matches: matchRows,
    days: dayRows,
    assignments: assignmentRows,
    segments: segmentRows,
    evidence: evidenceRows,
  });
}
