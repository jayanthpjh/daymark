const age = (from, to) => Number.isFinite(Date.parse(from)) ? Math.max(0, to - Date.parse(from)) : 0;
const safeCode = value => /^[a-z0-9_]{1,60}$/i.test(String(value || '')) ? String(value) : '';
export function taskDiagnostics(task, { now = Date.now() } = {}) {
  const terminal=['completed','cancelled','failed'].includes(task.status);
  const stop=terminal?Date.parse(task.submittedAt||task.updatedAt)||now:now;
  const history = task.orchestration?.history || [];
  const timeline = history.map((event, index) => ({
    revision: Number(event.revision) || 0, state: safeCode(event.state), worker: safeCode(event.worker),
    at: event.at, durationMs: age(event.at, index + 1 < history.length ? Date.parse(history[index + 1].at) : stop),
  }));
  const blocked = ['needs_you', 'paused', 'failed'].includes(task.status);
  return {
    taskId: task.id, jobId: task.jobId, state: safeCode(task.orchestration?.state || task.status),
    owner: safeCode(task.orchestration?.worker || (task.type === 'prepare' ? 'document' : 'browser')),
    timingKind:terminal?'finished':['queued','needs_you','paused'].includes(task.status)?'waiting':'active',
    elapsedMs: age(task.createdAt, stop),
    phaseAgeMs: age(task.orchestration?.updatedAt || task.updatedAt, stop),
    blockedBy: blocked ? safeCode(task.checkpoint?.pauseReason || task.recoveryReason || task.reviewReason || task.status) : '',
    retryAllowed: Boolean(!task.submitAttemptedAt && task.submissionOutcome !== 'confirmed' && (task.status === 'failed' || task.recoveryReason === 'navigation_failed')),
    submitAttempted: Boolean(task.submitAttemptedAt), outcome: safeCode(task.submissionOutcome || 'not_attempted'),
    retainedTransitions: timeline.length, historyLimited: timeline.length >= 100, timeline,
  };
}
