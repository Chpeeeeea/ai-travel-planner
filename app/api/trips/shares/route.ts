import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { dataLayer, digest, routeError } from "../../../../platform/server/planning-runtime";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function unauthorized() {
  return Response.json({ error: "Sign in with ChatGPT to manage trip sharing" }, { status: 401 });
}

function publicShare(share: { id: string; status: string; expiresAt: string | null; revokedAt: string | null; createdAt: string }) {
  return {
    id: share.id,
    status: share.status,
    expires_at: share.expiresAt,
    revoked_at: share.revokedAt,
    created_at: share.createdAt,
  };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  try {
    const runId = new URL(request.url).searchParams.get("run_id")?.trim() ?? "";
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { getDb, planningRuns, tripShareLinks } = await dataLayer();
    const db = getDb();
    const [run] = await db.select({ id: planningRuns.id }).from(planningRuns).where(and(
      eq(planningRuns.id, runId),
      eq(planningRuns.ownerUserId, user.userId),
    )).limit(1);
    if (!run) return Response.json({ error: "Travel plan not found" }, { status: 404 });
    const shares = await db.select().from(tripShareLinks).where(and(
      eq(tripShareLinks.runId, runId),
      eq(tripShareLinks.ownerUserId, user.userId),
    )).orderBy(desc(tripShareLinks.createdAt)).limit(20);
    return Response.json({ shares: shares.map(publicShare) });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  try {
    const payload = await request.json() as { run_id?: string; expires_days?: number | null };
    const runId = String(payload.run_id ?? "").trim().slice(0, 100);
    if (!runId) return Response.json({ error: "run_id is required" }, { status: 400 });
    const { getDb, planningRuns, tripShareLinks } = await dataLayer();
    const db = getDb();
    const [run] = await db.select().from(planningRuns).where(and(
      eq(planningRuns.id, runId),
      eq(planningRuns.ownerUserId, user.userId),
    )).limit(1);
    if (!run) return Response.json({ error: "Travel plan not found" }, { status: 404 });
    if (run.currentStage !== "published") return Response.json({ error: "Only a published trip can be shared" }, { status: 409 });
    const now = new Date();
    const shares = await db.select().from(tripShareLinks).where(and(
      eq(tripShareLinks.runId, runId),
      eq(tripShareLinks.ownerUserId, user.userId),
      eq(tripShareLinks.status, "active"),
    ));
    const activeShares = shares.filter((share) => !share.expiresAt || share.expiresAt > now.toISOString());
    if (activeShares.length >= 5) return Response.json({ error: "Each trip can have at most 5 active share links" }, { status: 429 });
    const expiresDays = payload.expires_days == null ? null : [7, 30, 90].includes(Number(payload.expires_days)) ? Number(payload.expires_days) : 30;
    const expiresAt = expiresDays ? new Date(now.getTime() + expiresDays * 86_400_000).toISOString() : null;
    const token = randomToken();
    const share = {
      id: crypto.randomUUID(),
      runId,
      ownerUserId: user.userId,
      tokenHash: await digest(token),
      status: "active",
      expiresAt,
      createdAt: now.toISOString(),
    };
    await db.insert(tripShareLinks).values(share);
    return Response.json({ share: publicShare({ ...share, revokedAt: null }), path: `/share/${token}` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  try {
    const payload = await request.json() as { share_id?: string };
    const shareId = String(payload.share_id ?? "").trim().slice(0, 100);
    if (!shareId) return Response.json({ error: "share_id is required" }, { status: 400 });
    const { getDb, tripShareLinks } = await dataLayer();
    const db = getDb();
    const [share] = await db.select().from(tripShareLinks).where(and(
      eq(tripShareLinks.id, shareId),
      eq(tripShareLinks.ownerUserId, user.userId),
    )).limit(1);
    if (!share) return Response.json({ error: "Share link not found" }, { status: 404 });
    const revokedAt = new Date().toISOString();
    await db.update(tripShareLinks).set({ status: "revoked", revokedAt }).where(eq(tripShareLinks.id, shareId));
    return Response.json({ share: { ...publicShare(share), status: "revoked", revoked_at: revokedAt } });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
