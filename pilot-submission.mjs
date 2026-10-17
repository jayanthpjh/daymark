import { createHash } from 'node:crypto';

// Only hashes and fixed event names enter the approval log; no answers or credentials.
function reviewFingerprint(fill, parent, job) {
  const a = parent?.artifacts;
  return createHash('sha256').update(JSON.stringify([
    fill.id, fill.parentTaskId, fill.jobId, job?.id, job?.url, job?.description,
    a?.resume, a?.coverLetter, a?.resumeVersion, a?.resumePdf, a?.resumeDocx,
    fill.employerIdentity, fill.filledSteps || [],
    fill.fieldsFilled || [], fill.checkpoint || null, fill.pendingAnswers || null,
    fill.attachedResumePath, fill.attachedResumeVersion, fill.formSnapshot || null,
  ])).digest('hex');
}
export function approveSubmission(fill, parent, job, { source = 'user' } = {}) {
  if (!parent?.artifacts?.approved || !job || fill.submitAttemptedAt) throw new Error('Review the current resume before approving submission.');
  const approval = { actor: source === 'auto' ? 'auto' : 'user', at: new Date().toISOString(), fingerprint: reviewFingerprint(fill, parent, job) };
  fill.submissionApproval = approval;
  fill.submissionAudit = [...(fill.submissionAudit || []), { event: 'SubmissionApproved', ...approval }].slice(-100);
}
export function submissionApprovalValid(fill, parent, job) {
  return Boolean(fill && job && parent?.artifacts?.approved && !fill.submitAttemptedAt
    && ['user', 'auto'].includes(fill.submissionApproval?.actor)
    && fill.submissionApproval.fingerprint === reviewFingerprint(fill, parent, job));
}

// Copy the reviewed inputs before the external click; later edits cannot rewrite history.
export function submissionReviewSnapshot(fill, parent, job) {
  return structuredClone({
    job: { id: job?.id, company: job?.company, role: job?.role, url: job?.url },
    materials: { resume: parent?.artifacts?.resume, coverLetter: parent?.artifacts?.coverLetter,
      resumeVersion: parent?.artifacts?.resumeVersion },
    filledSteps: fill.filledSteps || [], fieldsFilled: fill.fieldsFilled || [],
    attachedResumeVersion: fill.attachedResumeVersion,
    approval: fill.submissionApproval,
  });
}
