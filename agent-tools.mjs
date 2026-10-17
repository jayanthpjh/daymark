// Live agent tool catalogue and approval queue.
// Three tiers, enforced here on the server, never by the model's prompt:
//   read     runs immediately, changes nothing
//   change   runs immediately, changes only Daymark's own data (nothing leaves the machine)
//   approve  never runs from the agent; it becomes a pending confirmation the applicant must accept
// Anything not in the catalogue is refused. Mail, job and page text is data and never selects a tool.

export const TIERS = Object.freeze(['read', 'change', 'approve']);

export const TOOLS = Object.freeze({
  find_jobs: { tier: 'read', args: ['query'] },
  open_application: { tier: 'read', args: ['jobId', 'section'] },
  application_status: { tier: 'read', args: ['jobId'] },
  list_questions: { tier: 'read', args: [] },
  search_mail: { tier: 'read', args: ['query'] },
  show_calendar: { tier: 'read', args: ['from', 'to'] },
  add_job_link: { tier: 'change', args: ['url'] },
  collect_jobs: { tier: 'change', args: [] },
  prepare_application: { tier: 'change', args: ['jobId', 'tailoringMode'] },
  draft_text: { tier: 'change', args: ['purpose', 'context'] },
  fill_application: { tier: 'approve', args: ['jobId'] },
  approve_resume: { tier: 'approve', args: ['taskId'] },
  submit_application: { tier: 'approve', args: ['taskId'] },
  send_mail: { tier: 'approve', args: ['to', 'subject', 'body'] },
  answer_question: { tier: 'approve', args: ['questionId', 'value'] },
  answer_consent: { tier: 'approve', args: ['questionId', 'value'] },
  change_settings: { tier: 'approve', args: ['key', 'value'] },
});

export const CONFIRM_TTL_MS = 10 * 60 * 1000;

// Checks a tool request from the model. Returns { ok, tier, reason }. Never executes anything.
export function classifyToolCall(call) {
  const name = typeof call?.name === 'string' ? call.name : '';
  const spec = Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : null;
  if (!spec) return { ok: false, tier: null, reason: 'That action is not available to the agent.' };
  const args = call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args : {};
  const unknown = Object.keys(args).filter(key => !spec.args.includes(key));
  if (unknown.length) return { ok: false, tier: spec.tier, reason: `Unexpected fields: ${unknown.slice(0, 5).join(', ')}.` };
  for (const key of Object.keys(args)) {
    const value = args[key];
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return { ok: false, tier: spec.tier, reason: `Field ${key} must be text or a number.` };
    if (typeof value === 'string' && value.length > 4000) return { ok: false, tier: spec.tier, reason: `Field ${key} is too long.` };
  }
  return { ok: true, tier: spec.tier, reason: '' };
}

// Runs the call according to its tier. `execute` is the real action; `queue` holds approvals until the applicant confirms.
export function dispatchToolCall(call, { execute, queue, actor = 'agent', now = Date.now() }) {
  const check = classifyToolCall(call);
  if (!check.ok) return { status: 'refused', reason: check.reason };
  if (check.tier === 'approve') {
    const pending = queue.add({ name: call.name, args: call.args || {}, actor, now });
    return { status: 'needs_confirmation', confirmationId: pending.id, summary: describe(call), expiresAt: pending.expiresAt };
  }
  return execute({ name: call.name, args: call.args || {}, actor, tier: check.tier });
}

// Holds approvals until the applicant confirms. An ignored confirmation expires and does nothing.
export function createConfirmationQueue({ ttlMs = CONFIRM_TTL_MS, idFactory = () => Math.random().toString(36).slice(2, 12) } = {}) {
  const items = new Map();
  return {
    add({ name, args, actor, now = Date.now() }) {
      const id = idFactory();
      const item = { id, name, args, actor, createdAt: now, expiresAt: now + ttlMs, state: 'pending' };
      items.set(id, item);
      return { id, expiresAt: item.expiresAt };
    },
    // Runs the held action only if it is still pending and in time. Each confirmation can run once.
    async confirm(id, { execute, now = Date.now() }) {
      const item = items.get(id);
      if (!item || item.state !== 'pending') return { status: 'not_found' };
      if (now > item.expiresAt) { item.state = 'expired'; return { status: 'expired' }; }
      item.state = 'confirmed';
      const result = await execute({ name: item.name, args: item.args, actor: item.actor, confirmedAt: now });
      return { status: 'done', result };
    },
    decline(id) {
      const item = items.get(id);
      if (!item || item.state !== 'pending') return { status: 'not_found' };
      item.state = 'declined';
      return { status: 'declined' };
    },
    pending(now = Date.now()) {
      return [...items.values()].filter(item => item.state === 'pending' && now <= item.expiresAt).map(item => ({ id: item.id, summary: describe({ name: item.name, args: item.args }), expiresAt: item.expiresAt }));
    },
  };
}

const LABELS = {
  fill_application: 'Fill this application on the employer site',
  approve_resume: 'Approve this resume for this application',
  submit_application: 'Submit this application',
  send_mail: 'Save this email as a draft',
  answer_question: 'Send this answer to the employer',
  answer_consent: 'Send this consent choice to the employer',
  change_settings: 'Change this setting',
};
export function describe(call) {
  const label = LABELS[call.name] || `Run ${call.name}`;
  const target = call.args?.jobId || call.args?.taskId || call.args?.to || call.args?.key || '';
  return target ? `${label} (${String(target).slice(0, 80)})` : label;
}
