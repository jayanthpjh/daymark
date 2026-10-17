import { createHash } from 'node:crypto';
function pagePath(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return String(rawUrl || '').split(/[?#]/, 1)[0];
  }
}

export function createApplicationFlowGuard({ maxSteps = 12, maxVisits = 1, saved = {} } = {}) {
  const visits = new Map((saved.visits || []).filter(([key, count]) => /^[a-f0-9]{64}$/.test(key) && Number.isInteger(count) && count > 0));
  let steps = Math.max(0, Number(saved.steps) || 0);
  return {
    observe({ step, url, signature, values = '' }) {
      steps += 1;
      if (steps > maxSteps) return { allowed: false, reason: 'step_limit', steps };
      const fingerprint = createHash('sha256').update(JSON.stringify([String(step || ''), pagePath(url), String(signature || ''), values])).digest('hex');
      const count = (visits.get(fingerprint) || 0) + 1;
      visits.set(fingerprint, count);
      return count > maxVisits
        ? { allowed: false, reason: 'repeated_step', steps }
        : { allowed: true, reason: '', steps };
    },
    snapshot() { return { steps, visits: [...visits].slice(-maxSteps) }; },
    get steps() { return steps; },
  };
}

const reviewStates = Object.freeze({
  answers: 'answers_needed',
  validation: 'answers_needed',
  verification: 'verification_required',
  browser: 'verification_required',
  navigation_failed: 'verification_required',
  browser_intervention: 'verification_required',
  captcha: 'verification_required',
  authentication: 'authentication_required',
  legal_attestation: 'legal_review_required',
  unsupported: 'control_review_required',
  repeated_step: 'flow_intervention',
  step_limit: 'flow_intervention',
  submission: 'submission_confirmation_required',
  submission_uncertain: 'submission_confirmation_required',
  final_review: 'final_review_required',
});

export function humanReviewState(reason = '') {
  return { kind: reviewStates[reason] || 'user_action_required', required: true };
}

export function fieldVerification(questions = [], answers = {}, errors = {}) {
  return questions.filter(question => Object.hasOwn(answers, question.id)).map(question => ({
    questionId: question.id,
    label: question.label,
    status: errors[question.id] ? 'rejected' : 'verified',
    reason: errors[question.id] || '',
  }));
}
