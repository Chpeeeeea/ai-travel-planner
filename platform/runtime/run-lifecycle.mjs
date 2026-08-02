export const INACTIVE_RUN_STATUSES = ["complete", "complete_with_warnings", "failed", "canceled"];

export function canCancelRun(run) {
  return run.currentStage !== "published" && !INACTIVE_RUN_STATUSES.includes(run.status);
}

export function canArchiveRun(run) {
  return run.currentStage === "published" || INACTIVE_RUN_STATUSES.includes(run.status);
}
