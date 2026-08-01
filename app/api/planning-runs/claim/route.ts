import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { topicsForInterests } from "../../../../platform/runtime/travel-topics.mjs";
import { dataLayer, deny, digest, routeError, stageOrder, type RunStage } from "../../../../platform/server/planning-runtime";

const claimableStatuses = ["draft", "queued", "running", "running_with_warnings", "worker_retry"];
const claimableStages = stageOrder.filter((stage) => stage !== "published");

function clean(value: unknown, maximum = 120) {
  return String(value ?? "").trim().slice(0, maximum);
}

function leaseSeconds(value: unknown) {
  return Math.max(60, Math.min(900, Math.floor(Number(value) || 300)));
}

function leaseExpiry(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function publicLane(job: {
  lane: string;
  topicLabel: string;
  status: string;
  attemptCount: number;
  evidenceCount: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}) {
  return {
    lane: job.lane,
    topic_label: job.topicLabel,
    status: job.status,
    attempt_count: job.attemptCount,
    evidence_count: job.evidenceCount,
    last_error: job.lastError,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    updated_at: job.updatedAt,
  };
}

async function leaseMatches(run: { leaseTokenHash: string | null; leaseExpiresAt: string | null }, supplied: string) {
  if (!run.leaseTokenHash || !run.leaseExpiresAt || run.leaseExpiresAt <= new Date().toISOString() || !supplied) return false;
  return run.leaseTokenHash === await digest(supplied);
}

export async function GET(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const runId = clean(new URL(request.url).searchParams.get("run_id"), 100);
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { getDb, planningRuns, researchLaneJobs } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    const jobs = await db.select().from(researchLaneJobs).where(eq(researchLaneJobs.runId, runId)).orderBy(asc(researchLaneJobs.lane));
    return Response.json({
      run: {
        id: run.id,
        current_stage: run.currentStage,
        status: run.status,
        worker_attempt: run.workerAttempt,
        leased: Boolean(run.leaseExpiresAt && run.leaseExpiresAt > new Date().toISOString()),
        lease_expires_at: run.leaseExpiresAt,
      },
      lanes: jobs.map(publicLane),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as { worker_id?: string; worker_version?: string; lease_seconds?: number };
    const workerId = clean(payload.worker_id, 100);
    const workerVersion = clean(payload.worker_version, 80);
    if (!workerId || !/^[a-zA-Z0-9._:-]+$/.test(workerId)) {
      return Response.json({ error: "worker_id is required and may contain letters, numbers, dot, underscore, colon or hyphen" }, { status: 400 });
    }
    const seconds = leaseSeconds(payload.lease_seconds);
    const now = new Date().toISOString();
    const { getDb, planningBriefs, planningRunEvents, planningRuns, researchLaneJobs } = await dataLayer();
    const db = getDb();
    const available = await db.select().from(planningRuns).where(and(
      inArray(planningRuns.currentStage, claimableStages),
      inArray(planningRuns.status, claimableStatuses),
      lt(planningRuns.workerAttempt, 5),
      or(isNull(planningRuns.leaseExpiresAt), lt(planningRuns.leaseExpiresAt, now)),
    )).orderBy(asc(planningRuns.updatedAt)).limit(10);

    for (const candidate of available) {
      const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
      const tokenHash = await digest(rawToken);
      const nextStage = candidate.currentStage === "brief" ? "researching" : candidate.currentStage as RunStage;
      const expiresAt = leaseExpiry(seconds);
      const [claimed] = await db.update(planningRuns).set({
        currentStage: nextStage,
        status: "running",
        workerAttempt: sql`${planningRuns.workerAttempt} + 1`,
        workerVersion: workerVersion || null,
        leaseOwner: workerId,
        leaseTokenHash: tokenHash,
        leaseExpiresAt: expiresAt,
        lastError: null,
        updatedAt: now,
      }).where(and(
        eq(planningRuns.id, candidate.id),
        eq(planningRuns.currentStage, candidate.currentStage),
        eq(planningRuns.status, candidate.status),
        or(isNull(planningRuns.leaseExpiresAt), lt(planningRuns.leaseExpiresAt, now)),
      )).returning();
      if (!claimed) continue;

      const [briefRow] = await db.select().from(planningBriefs).where(eq(planningBriefs.runId, candidate.id)).limit(1);
      const brief = briefRow ? JSON.parse(briefRow.briefJson) : null;
      if (["brief", "researching"].includes(candidate.currentStage)) {
        const topics = topicsForInterests(brief?.interests ?? []);
        const laneRows = await Promise.all(topics.map(async (topic: { id: string; label: string }) => ({
          id: `lane-${(await digest(`${candidate.id}:${topic.id}`)).slice(0, 28)}`,
          runId: candidate.id,
          lane: topic.id,
          topicLabel: topic.label,
          status: "queued",
          createdAt: now,
          updatedAt: now,
        })));
        await db.insert(researchLaneJobs).values(laneRows).onConflictDoNothing();
      }
      await db.insert(planningRunEvents).values({
        id: crypto.randomUUID(),
        runId: candidate.id,
        fromStage: candidate.currentStage,
        toStage: nextStage,
        status: "worker_claimed",
        message: `Research Worker claimed attempt ${claimed.workerAttempt}`,
        createdAt: now,
      });
      const jobs = await db.select().from(researchLaneJobs).where(eq(researchLaneJobs.runId, candidate.id)).orderBy(asc(researchLaneJobs.lane));
      return Response.json({
        lease: { token: rawToken, expires_at: expiresAt, heartbeat_after_seconds: Math.max(30, Math.floor(seconds / 2)) },
        run: {
          id: claimed.id,
          destination: claimed.destination,
          days: claimed.days,
          current_stage: claimed.currentStage,
          status: claimed.status,
          worker_attempt: claimed.workerAttempt,
          provider_poi_calls: claimed.providerPoiCalls,
          provider_route_calls: claimed.providerRouteCalls,
        },
        brief,
        lanes: jobs.map(publicLane),
      });
    }
    return Response.json({ job: null, retry_after_seconds: 15 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await deny(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as {
      run_id?: string;
      lease_token?: string;
      action?: "heartbeat" | "lane_started" | "lane_completed" | "lane_failed" | "release" | "run_failed";
      lane?: string;
      lease_seconds?: number;
      evidence_count?: number;
      artifact_markdown?: string;
      error?: string;
      retryable?: boolean;
      release_status?: string;
    };
    const runId = clean(payload.run_id, 100);
    const action = payload.action;
    const suppliedToken = clean(payload.lease_token, 200);
    if (!runId || !action) return Response.json({ error: "run_id, lease_token and action are required" }, { status: 400 });
    const { getDb, planningRunEvents, planningRuns, researchLaneJobs } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(eq(planningRuns.id, runId)).limit(1);
    if (!run) return Response.json({ error: "PlanningRun not found" }, { status: 404 });
    if (!(await leaseMatches(run, suppliedToken))) return Response.json({ error: "Lease is missing, expired or belongs to another worker" }, { status: 409 });
    const now = new Date().toISOString();

    if (action === "heartbeat") {
      const expiresAt = leaseExpiry(leaseSeconds(payload.lease_seconds));
      await db.update(planningRuns).set({ leaseExpiresAt: expiresAt, updatedAt: now }).where(eq(planningRuns.id, runId));
      return Response.json({ run_id: runId, lease_expires_at: expiresAt });
    }

    if (["lane_started", "lane_completed", "lane_failed"].includes(action)) {
      const lane = clean(payload.lane, 30);
      if (!/^[a-z][a-z0-9_]{0,29}$/.test(lane)) return Response.json({ error: "A valid research lane is required" }, { status: 400 });
      const [job] = await db.select().from(researchLaneJobs).where(and(eq(researchLaneJobs.runId, runId), eq(researchLaneJobs.lane, lane))).limit(1);
      if (!job) return Response.json({ error: "Research lane job not found" }, { status: 404 });
      if (action === "lane_started") {
        if (job.status !== "succeeded") {
          await db.update(researchLaneJobs).set({
            status: "running",
            attemptCount: sql`${researchLaneJobs.attemptCount} + 1`,
            lastError: null,
            startedAt: now,
            completedAt: null,
            updatedAt: now,
          }).where(eq(researchLaneJobs.id, job.id));
        }
      } else if (action === "lane_completed") {
        await db.update(researchLaneJobs).set({
          status: "succeeded",
          evidenceCount: Math.max(0, Math.min(1000, Math.floor(Number(payload.evidence_count) || 0))),
          artifactMarkdown: clean(payload.artifact_markdown, 100_000),
          lastError: null,
          completedAt: now,
          updatedAt: now,
        }).where(eq(researchLaneJobs.id, job.id));
      } else {
        await db.update(researchLaneJobs).set({
          status: "failed",
          lastError: clean(payload.error || "Research lane failed", 1000),
          completedAt: now,
          updatedAt: now,
        }).where(eq(researchLaneJobs.id, job.id));
      }
      const [updated] = await db.select().from(researchLaneJobs).where(eq(researchLaneJobs.id, job.id)).limit(1);
      return Response.json({ run_id: runId, lane: publicLane(updated) });
    }

    const errorMessage = clean(payload.error, 1000);
    const releaseStatuses = new Set(["running", "worker_retry", "awaiting_confirmation", "complete", "complete_with_warnings", "failed"]);
    let status = action === "run_failed" ? (payload.retryable === false || run.workerAttempt >= 5 ? "failed" : "worker_retry") : clean(payload.release_status, 40);
    if (!releaseStatuses.has(status)) status = run.currentStage === "published" ? "complete" : "running";
    await db.update(planningRuns).set({
      status,
      leaseOwner: null,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      lastError: errorMessage || null,
      updatedAt: now,
    }).where(eq(planningRuns.id, runId));
    await db.insert(planningRunEvents).values({
      id: crypto.randomUUID(),
      runId,
      fromStage: run.currentStage,
      toStage: run.currentStage,
      status: action === "run_failed" ? "worker_failed" : "worker_released",
      message: errorMessage || `Research Worker released the run as ${status}`,
      createdAt: now,
    });
    return Response.json({ run: { id: runId, current_stage: run.currentStage, status, leased: false } });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
