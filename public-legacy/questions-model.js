// Pure model for the Questions inbox: classifies each unanswered employer question and groups identical
// questions across waiting applications so a factual answer is given once. Shared by the server (to enforce
// the same rules) and the screen. No DOM, no I/O.

const CONSENT = /consent|agree|terms|privacy|signature|certif|attest|acknowledg|policy|declaration|under penalty/i;
const LEGAL = /criminal|convict|felony|arrest|non[- ]?compete|non[- ]?solicit|personal\/familial|familial|relatives?\b|relationship.{0,40}(employee|official)|government (official|employee)|conflict of interest|background check|drug test|export control|\bitar\b|security clearance|sanction/i;
const EEO = /gender|\bsex\b|sexual|transgender|\brace\b|racial|ethnic|hispanic|latino|veteran|military|disabilit|lgbtq|pronoun|marital|religio/i;
const AUTHORIZATION = /visa|sponsor|work authori[sz]ation|authori[sz]ed to work|legally .{0,20}work|right to work|citizen/i;
// Questions the answer engine fills from the Answer pack's EEO choices, so a saved answer lands there.
const EEO_PACK = [['eeo_gender', /gender|\bsex\b/i], ['eeo_hispanic', /hispanic|latino/i], ['eeo_race', /\brace\b|ethnic/i], ['eeo_veteran', /veteran/i], ['eeo_disability', /disabilit/i]];

export const cleanLabel = label => String(label || '').replace(/\s+/g, ' ').replace(/\s*\*+\s*$/, '').trim();
export const normalizeQuestionKey = label => cleanLabel(label).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// lane "decision": legal or consent wording; always the applicant's own call, never remembered, never shared
// across applications. lane "default": a fact or preference that can be saved and reused.
export function classifyQuestion(q) {
  const label = String(q?.label || '');
  if (LEGAL.test(label)) return { lane: 'decision', kind: 'legal', title: 'Your decision', saveTarget: 'none', note: 'A legal or conflict-of-interest question. It applies only to this application and is never remembered.' };
  if (CONSENT.test(label)) return { lane: 'decision', kind: 'consent', title: 'Your decision', saveTarget: 'none', note: 'A consent or attestation. Daymark never answers or remembers these for you.' };
  if (EEO.test(label)) {
    const pack = EEO_PACK.find(([, pattern]) => pattern.test(label));
    return { lane: 'default', kind: 'eeo', title: 'Voluntary self-identification', saveTarget: pack ? 'answer pack' : 'library', packKey: pack?.[0] || '', note: 'Voluntary. Declining is always a valid choice.' };
  }
  if (AUTHORIZATION.test(label)) return { lane: 'default', kind: 'authorization', title: 'Work authorization', saveTarget: 'library', note: 'Your own factual answer, reused when an employer asks the same thing.' };
  if (q?.type === 'textarea') return { lane: 'default', kind: 'open', title: 'Open-ended', saveTarget: 'library', note: 'Write it yourself, or draft with NVIDIA and edit before you send.' };
  return { lane: 'default', kind: 'fact', title: 'Fact or preference', saveTarget: 'library', note: 'Saved once and reused for matching questions.' };
}

const optionKey = q => (q.options || []).map(o => o.value).join('\u0001');

// Groups every unresolved question from tasks waiting on the user. Factual questions with the same wording,
// type and options merge across applications; decisions stay one card per application.
export function buildQuestionInbox(tasks = [], jobs = []) {
  const jobById = new Map(jobs.map(job => [job.id, job]));
  const groups = new Map();
  const employerPage = [];
  const waiting = new Set();
  for (const task of tasks) {
    if (task?.type !== 'fill' || task.status !== 'needs_you') continue;
    const checkpoint = task.checkpoint;
    if (!checkpoint?.questions?.length || checkpoint.pauseReason === 'verification') continue;
    const wanted = new Set([...(checkpoint.unresolvedIds || []), ...Object.keys(checkpoint.errors || {})]);
    if (!wanted.size) continue;
    const job = jobById.get(task.jobId) || {};
    for (const q of checkpoint.questions) {
      if (!wanted.has(q.id)) continue;
      const meta = classifyQuestion(q);
      const item = { taskId: task.id, parentTaskId: task.parentTaskId, jobId: task.jobId, company: job.company || task.company || 'Company', role: job.role || task.role || 'Role', step: checkpoint.step || '', checkpointId: checkpoint.id, questionId: q.id, error: checkpoint.errors?.[q.id] || '' };
      waiting.add(task.id);
      // Consent and acknowledgement boxes are a decision for you, shown here as Yes or No; Daymark ticks the box on the page.
      const consent = q.manual && /consent|privacy|agree|terms|acknowledg|sms|text message|marketing/i.test(String(q.label || ''));
      if (q.manual && !consent) { employerPage.push({ ...item, label: cleanLabel(q.label), kind: meta.kind, lane: meta.lane }); continue; }
      if (consent) {
        const key = `consent:${task.id}:${q.id}`;
        groups.set(key, { key, label: cleanLabel(q.label), type: 'select', options: [{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }], required: false, maxLength: null, instructions: '', meta: { lane: 'decision', kind: 'consent', title: 'Your decision', saveTarget: 'none', note: 'A consent you give to the employer. Daymark only ticks the box you choose here, and never remembers it for other applications.' }, items: [item] });
        continue;
      }
      const key = meta.lane === 'decision' ? `decision:${task.id}:${q.id}` : `${normalizeQuestionKey(q.label)}|${q.type}|${optionKey(q)}`;
      let group = groups.get(key);
      if (!group) { group = { key, label: cleanLabel(q.label), type: q.type, options: q.options || [], required: false, maxLength: q.maxLength || null, instructions: q.instructions || '', meta, items: [] }; groups.set(key, group); }
      group.required ||= Boolean(q.required);
      group.items.push(item);
    }
  }
  const all = [...groups.values()];
  const rank = group => (group.meta.lane === 'decision' ? 2 : group.meta.kind === 'eeo' ? 1 : 0);
  all.sort((a, b) => rank(a) - rank(b) || b.items.length - a.items.length || a.label.localeCompare(b.label));
  return { groups: all, employerPage, counts: { questions: all.length, applications: waiting.size, answersToSend: all.reduce((n, g) => n + g.items.length, 0) } };
}

// Facts are remembered by default; open-ended answers are usually specific to one company, so they are not.
export const defaultSave = group => group.meta.lane === 'default' && group.meta.kind !== 'open';

// A card counts as answered once it holds a non-empty value (arrays for checkbox groups).
export const isAnswered = value => Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== '';

// What the screen submits: one item per application per answered card.
export function answerItems(groups, drafts, saves = {}) {
  const items = [];
  for (const group of groups) {
    const value = drafts[group.key];
    if (!isAnswered(value)) continue;
    const save = group.meta.lane === 'default' && (saves[group.key] ?? defaultSave(group));
    for (const target of group.items) items.push({ taskId: target.taskId, checkpointId: target.checkpointId, questionId: target.questionId, value, save });
  }
  return items;
}
