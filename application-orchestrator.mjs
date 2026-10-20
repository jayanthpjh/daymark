const pauseStates = Object.freeze({
  answers: 'needs_user_answer', validation: 'needs_user_answer',
  legal_attestation: 'needs_consent', consent: 'needs_consent',
  verification: 'needs_verification', authentication: 'authenticating',
  captcha: 'needs_manual_step', unsupported: 'needs_manual_step',
  browser: 'needs_manual_step', browser_intervention: 'needs_manual_step',
  repeated_step: 'needs_manual_step', step_limit: 'needs_manual_step',
  submission_uncertain: 'submission_uncertain',
});
const workerForState = state => state === 'preparing_documents' ? 'document'
  : state === 'needs_verification' ? 'mailbox'
    : state.startsWith('needs_') || state === 'final_review' ? 'dialogue'
      : ['opening_application','authenticating','reading_form','filling_known_answers','verifying_fields','waiting_for_browser','submitting','submission_queued','awaiting_confirmation','submitted','submission_uncertain'].includes(state) ? 'browser'
        : state === 'recoverable_failure' ? 'watchdog' : 'orchestrator';
const eventForState = state => ({
  documents_ready: 'DocumentsReady', reading_form: 'FormSnapshotCaptured', needs_user_answer: 'AnswerNeeded',
  needs_consent: 'ConsentNeeded', needs_verification: 'VerificationNeeded', final_review: 'FinalReviewReady',
  filling_known_answers: 'AnswersSaved', submission_queued: 'SubmissionQueued', awaiting_confirmation: 'AwaitingATSReceipt', submitting: 'SubmissionRequested', submitted: 'SubmissionConfirmed',
  submission_uncertain: 'SubmissionUncertain', recoverable_failure: 'CheckpointRecoveryNeeded',
}[state] || `Application${state.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join('')}`);

export function preparationReadyMessage(task = {}) {
  if (task.reviewPolicy !== 'final') return 'Resume and cover letter are ready.';
  return task.autoFill
    ? 'Tailored documents prepared. Filling continues before your final review.'
    : 'Tailored documents are ready for your review. Browser filling is paused.';
}

export function applicationOrchestrationState(task = {}) {
  const checkpointReason = task.checkpoint?.pauseReason || task.recoveryReason || '';
  if (task.submissionOutcome === 'confirmed') return 'submitted';
  if (task.type === 'fill' && task.status === 'running' && task.submitAttemptedAt) return ['challenge_detected','waiting_for_code','code_found','verification_attempted'].includes(task.submissionVerification?.stage) ? 'needs_verification' : 'awaiting_confirmation';
  if (task.submissionOutcome === 'uncertain' || checkpointReason === 'submission_uncertain') return 'submission_uncertain';
  if (task.type === 'prepare') {
    if (task.status === 'queued') return 'queued';
    if (task.status === 'running') return 'preparing_documents';
    if (task.status === 'ready_for_review' || task.status === 'completed') return 'documents_ready';
    if (task.status === 'needs_you') return 'needs_user_answer';
    if (task.status === 'failed') return 'recoverable_failure';
  }
  if (task.type === 'fill') {
    if (task.submitRequested) return 'submission_queued';
    if (task.submitAttemptedAt) return task.status === 'running' ? 'awaiting_confirmation' : 'submission_uncertain';
    if (task.finalReviewReady) return 'final_review';
    if (task.status === 'queued') return Object.keys(task.pendingAnswers || {}).length ? 'filling_known_answers' : task.parentTaskId ? 'waiting_for_browser' : 'queued';
    if (task.status === 'failed') return 'recoverable_failure';
    if (task.status === 'completed' || task.submittedAt) return 'submission_uncertain';
    if (task.status === 'needs_you' || task.status === 'paused') {
      if (pauseStates[checkpointReason]) return pauseStates[checkpointReason];
      const stage = String(task.stage || '').toLowerCase();
      if (/answer|question|validation/.test(stage)) return 'needs_user_answer';
      if (/consent|attest/.test(stage)) return 'needs_consent';
      if (/auth|sign.?in/.test(stage)) return 'authenticating';
      if (/final review|review/.test(stage)) return 'final_review';
      return 'needs_manual_step';
    }
    if (task.status === 'running') {
      const stage = String(task.stage || '').toLowerCase();
      if (/auth|sign.?in|verification/.test(stage)) return 'authenticating';
      if (/open|navigat/.test(stage)) return 'opening_application';
      if (/read|extract|inspect/.test(stage)) return 'reading_form';
      if (/verif/.test(stage)) return 'verifying_fields';
      if (/fill|answer|upload/.test(stage)) return 'filling_known_answers';
      return 'opening_application';
    }
  }
  if (task.status === 'failed') return 'recoverable_failure';
  return 'queued';
}

export function syncApplicationOrchestration(task, { now = new Date().toISOString() } = {}) {
  if (!task || !['prepare', 'fill'].includes(task.type)) return task;
  const next = applicationOrchestrationState(task);
  const current = task.orchestration || { state: '', revision: 0, history: [] };
  const checkpointId = typeof task.checkpoint?.id === 'string' ? task.checkpoint.id.slice(0, 120) : '';
  const stage = String(task.stage || '').slice(0, 100);
  if (current.state === next && current.checkpointId === checkpointId && current.stage === stage) return task;
  // A confirmed employer receipt is terminal; stale worker snapshots cannot undo it.
  if (current.state === 'submitted' && next !== 'submitted') return task;
  const revision = Math.max(0, Number(current.revision) || 0) + 1;
  const history = [...(Array.isArray(current.history) ? current.history : []), {
    revision, event: eventForState(next), worker: workerForState(next), state: next, stage, checkpointId,
    at: now, message: String(task.message || '').replace(/https?:\/\/\S+/gi, '[employer page]').slice(0, 300),
  }].slice(-100);
  task.orchestration = { state: next, worker: workerForState(next), revision, checkpointId, stage, updatedAt: now, history };
  return task;
}
