import { humanReviewState } from './application-flow.mjs';

export function workerStallDecision({ activeTaskId, lastProgressAt }, { now = Date.now(), stallMs = 5 * 60_000 } = {}) {
  if (!activeTaskId || !Number.isFinite(Number(lastProgressAt)) || Number(lastProgressAt) <= 0) return null;
  if (now - Number(lastProgressAt) <= stallMs) return null;
  return { action: 'restart_worker', taskId: activeTaskId, stalledForMs: now - Number(lastProgressAt) };
}

export function taskWatchdogDecision(task, heartbeat, { now = Date.now(), staleMs = 15_000, missingHeartbeatMs = 45_000 } = {}) {
  if (!task || task.status !== 'running') return null;
  const heartbeatAt = Number(heartbeat?.heartbeatAt || heartbeat?.at || 0);
  const age = heartbeatAt > 0 ? now - heartbeatAt : now - Date.parse(task.updatedAt || 0);
  const threshold = heartbeatAt > 0 ? staleMs : missingHeartbeatMs;
  if (!Number.isFinite(age) || age <= threshold) return null;
  if (heartbeat?.activeTaskId && heartbeat.activeTaskId !== task.id) return null;

  if (task.submitAttemptedAt && !task.submittedAt) {
    return {
      status: 'needs_you',
      stage: 'Submission unconfirmed',
      reviewState: humanReviewState('submission_uncertain'),
      recoveryReason: 'submission_uncertain',
      submissionOutcome: 'uncertain',
      submitRequested: false,
      finalReviewReady: false,
      message: 'The worker stopped after a submit attempt. Check the employer page or your inbox; Daymark will not submit again automatically.',
    };
  }
  return {
    status: 'needs_you',
    stage: 'Worker recovery needed',
    reviewState: humanReviewState('verification'),
    recoveryReason: 'worker_lost',
    finalReviewReady: false,
    message: 'The application worker stopped during this step. Your saved checkpoint is preserved. Resolve this step to verify the employer page, then continue processing.',
  };
}
