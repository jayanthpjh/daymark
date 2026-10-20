// @ts-nocheck -- direct port of the legacy model; typed incrementally (see types.ts for the state shapes).
// Pure view-model for the Overview "Execution stream": everything shown comes from recorded tasks/applications.
const live = task => ['queued', 'running'].includes(task.status);
const pad = value => String(value).padStart(2, '0');
export const formatClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
export function relativeClock(ms, now) {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 10) return 'now';
  if (s < 3600) return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  return s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
}
const time = task => Date.parse(task.updatedAt || task.createdAt || '') || 0;
export const isAwaitingReview = task => task.type === 'fill' && task.status === 'needs_you' && Boolean(task.finalReviewReady) && !task.submitAttemptedAt && task.submissionOutcome!=='blocked';

export function streamModel(state, now = Date.now()) {
  const tasks = state.tasks || [], jobs = state.jobs || [], applications = state.applications || [];
  const reviewOn = state.preferences?.reviewBeforeSubmit === true;
  const work = tasks.filter(task => task.type !== 'collect');
  const byType = type => tasks.filter(task => task.type === type);
  const awaiting = work.filter(isAwaitingReview);
  const stuck = work.filter(task => task.status === 'needs_you' && !isAwaitingReview(task));
  const submittedJobs = new Set([...applications.filter(item => item.status === 'submitted' || item.submittedAt).map(item => item.jobId), ...work.filter(task => task.submittedAt).map(task => task.jobId)]);
  const submitting = work.some(task => task.type === 'fill' && task.stage === 'Submitting' && live(task));
  const today = new Date(now).toDateString();
  const state_ = (active, waiting, count) => active ? 'active' : waiting ? 'waiting' : count ? 'done' : 'idle';
  const prepare = byType('prepare'), fill = byType('fill');
  const stages = [
    { id: 'discover', label: 'Discover', sub: `${jobs.length} role${jobs.length === 1 ? '' : 's'}`, count: jobs.length, status: state_(byType('collect').some(live), false, jobs.length) },
    { id: 'score', label: 'Score', sub: `${jobs.filter(job => job.match != null).length} matched`, count: jobs.filter(job => job.match != null).length, status: state_(false, false, jobs.some(job => job.match != null)) },
    { id: 'tailor', label: 'Tailor', sub: `${prepare.filter(task => task.hasArtifacts).length} ready`, count: prepare.length, status: state_(prepare.some(live), false, prepare.length) },
    { id: 'fill', label: 'Fill', sub: stuck.filter(task => task.type === 'fill').length ? `${stuck.filter(task => task.type === 'fill').length} waiting` : `${fill.length} form${fill.length === 1 ? '' : 's'}`, count: fill.length, status: state_(fill.some(task => live(task) && task.stage !== 'Submitting'), stuck.some(task => task.type === 'fill'), fill.length) },
  ];
  if (reviewOn || awaiting.length) stages.push({ id: 'review', label: 'Your review', sub: awaiting.length ? `${awaiting.length} waiting` : 'none waiting', count: awaiting.length, status: state_(false, awaiting.length > 0, 0) });
  stages.push({ id: 'submit', label: 'Submit', sub: `${submittedJobs.size} sent`, count: submittedJobs.size, status: state_(submitting, false, submittedJobs.size) });

  const verb = { collect: 'Discovering roles', prepare: 'Tailoring', fill: 'Filling' };
  const events = [...tasks].sort((a, b) => time(b) - time(a)).map(task => {
    const role = task.role || 'Application', at = time(task) || now;
    let badge = 'DONE', title, detail = task.message || '';
    if (task.type === 'collect') { title = live(task) ? 'Discovering roles' : task.status === 'failed' ? 'Collection failed' : 'Discovered roles'; badge = live(task) ? 'RUNNING' : task.status === 'failed' ? 'ACTION' : 'DONE'; }
    else if (task.submittedAt) { title = `Submitted · ${role}`; detail = `${task.company || ''} · ${task.submittedBy === 'agent' ? 'auto-submitted' : 'submitted after your review'}`; }
    else if (isAwaitingReview(task)) { title = `Review before submit · ${role}`; detail = `${task.company || ''} · filled answers ready`; badge = 'ACTION'; }
    else if (task.status === 'needs_you') { title = `${task.stage || 'Needs you'} · ${role}`; badge = 'ACTION'; }
    else if (task.status === 'failed') { title = `Failed · ${role}`; badge = 'ACTION'; }
    else if (live(task)) { title = `${task.stage && task.type === 'fill' ? task.stage : verb[task.type] || 'Working'} · ${role}`; badge = 'RUNNING'; }
    else if (['paused', 'cancelled'].includes(task.status)) { title = `Stopped · ${role}`; badge = 'SKIPPED'; }
    else { title = `${task.type === 'prepare' ? 'Tailored' : 'Completed'} · ${role}`; }
    return { id: task.id, jobId: task.jobId, type: task.type, title, detail: detail.slice(0, 120), badge, at, status: task.status, href: task.type === 'collect' ? '' : 'application' };
  });
  for (const app of applications.filter(item => item.status === 'skipped').slice(0, 6)) events.push({ id: 'skip-' + app.id, jobId: app.jobId, type: 'skip', title: `Skipped · ${app.skipReason || 'matched a skip rule'}`, detail: `${app.company || ''} · ${app.role || ''} · Rule: ${app.skipRule || 'skip rule'}`, badge: 'SKIPPED', at: Date.parse(app.updatedAt || app.createdAt || '') || now, status: 'skipped', href: '' });
  const needsYou = ['Screening', 'Interview', 'Assessment', 'Offer'];
  for (const mail of (state.mailEvents || []).slice(0, 6)) {
    const urgent = (mail.categories || []).some(c => needsYou.includes(c));
    events.push({ id: 'mail-' + mail.id, jobId: mail.jobId, type: 'mail', title: urgent ? `Recruiter reply detected · ${mail.company || ''}` : `${(mail.categories || ['Mail'])[0]} · ${mail.company || ''}`, detail: urgent ? 'Forwarded to Inbox · needs you' : (mail.statusChange ? `Status moved to ${mail.statusChange}` : (mail.subject || '')), badge: urgent ? 'ACTION' : 'DONE', at: Date.parse(mail.at || '') || now, status: 'mail', href: 'inbox' });
  }
  events.sort((a, b) => Number(b.badge === 'ACTION') - Number(a.badge === 'ACTION') || b.at - a.at);
  events.splice(7);
  const todayWork = prepare.filter(task => new Date(task.createdAt || 0).toDateString() === today);
  const done = todayWork.filter(task => submittedJobs.has(task.jobId) || ['completed'].includes(task.status)).length;
  const open = [...tasks.filter(live), ...awaiting, ...stuck];
  const since = open.map(task => Date.parse(task.createdAt || '') || now);
  return {
    stages, events, reviewOn, awaiting: awaiting.length, processes: new Set(open.map(task => task.id)).size,
    startedAt: since.length ? Math.min(...since) : null, active: tasks.some(live),
    queued: tasks.filter(task => task.status === 'queued').length, needsYou: stuck.length,
    batch: { done, total: todayWork.length },
  };
}
