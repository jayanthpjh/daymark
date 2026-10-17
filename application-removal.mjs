// Removing applications and expired jobs from the lists. Pure functions: the server writes a backup first, then applies these.
// "Remove" deletes the application record and its tasks. Files already written to disk (resumes, proof screenshots) are left alone.
const STARTED_STATUSES = new Set(['submitted', 'unconfirmed', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'in_progress', 'filled']);
const BUSY = new Set(['queued', 'running']);
const DAY = 86_400_000;

const forJob = (items, jobId) => items.filter(item => item.jobId === jobId && item.type !== 'collect');

/** What removing these jobs' applications would do, and whether anything stops it. */
export function removalPlan(state, jobIds) {
  const ids = [...new Set((jobIds || []).map(String))];
  const plan = { jobIds: [], applications: [], tasks: [], blocked: [], submitted: [], unknown: [] };
  for (const jobId of ids) {
    const job = state.jobs.find(j => j.id === jobId);
    const apps = state.applications.filter(a => a.jobId === jobId || a.id === jobId);
    const tasks = forJob(state.tasks, jobId);
    if (!job && !apps.length && !tasks.length) { plan.unknown.push(jobId); continue; }
    const busy = tasks.find(t => BUSY.has(t.status));
    if (busy) { plan.blocked.push({ jobId, company: job?.company || apps[0]?.company || '', reason: 'Work is still running or queued. Cancel it first.' }); continue; }
    plan.jobIds.push(jobId);
    plan.applications.push(...apps.map(a => a.id || a.jobId));
    plan.tasks.push(...tasks.map(t => t.id));
    if (apps.some(a => ['submitted', 'unconfirmed', 'screening', 'interview', 'offer'].includes(a.status)) || tasks.some(t => t.submitAttemptedAt)) plan.submitted.push({ jobId, company: job?.company || apps[0]?.company || '', role: job?.role || apps[0]?.role || '' });
  }
  return plan;
}

/** Applies a plan in place. With alsoJobs the posting leaves Discover too; otherwise it stays and can be applied to again. */
export function removeFromState(state, plan, { alsoJobs = false } = {}) {
  const jobSet = new Set(plan.jobIds), appSet = new Set(plan.applications), taskSet = new Set(plan.tasks);
  state.applications = state.applications.filter(a => !appSet.has(a.id || a.jobId) && !jobSet.has(a.jobId));
  state.tasks = state.tasks.filter(t => !taskSet.has(t.id));
  if (alsoJobs) state.jobs = state.jobs.filter(j => !jobSet.has(j.id));
  state.mailEvents = (state.mailEvents || []).filter(m => !jobSet.has(m.jobId));
  return { applications: appSet.size, tasks: taskSet.size, jobs: alsoJobs ? jobSet.size : 0 };
}

/**
 * Jobs that are no longer worth keeping: the employer closed them, or they were posted before the age limit.
 * Never a job you started on (a task, or an application that is not just a skip record).
 */
export function expiredJobs(state, { now = Date.now(), maxAgeDays = 0 } = {}) {
  const out = [];
  for (const job of state.jobs || []) {
    if (!String(job.id).startsWith('ats-')) continue; // manual imports and other sources are yours to remove
    const started = forJob(state.tasks, job.id).length > 0 || state.applications.some(a => a.jobId === job.id && a.status !== 'skipped' && a.status !== 'not_started');
    if (started) continue;
    const posted = Date.parse(job.posted || '');
    if (job.closedAt) out.push({ id: job.id, company: job.company, role: job.role, reason: 'closed' });
    else if (maxAgeDays > 0 && Number.isFinite(posted) && now - posted > maxAgeDays * DAY) out.push({ id: job.id, company: job.company, role: job.role, reason: 'old' });
  }
  return out;
}

/** Removing an expired job also drops its skip record, so auto-apply cannot bring a "skipped" row back for it. */
export function removeExpired(state, expired) {
  const ids = new Set(expired.map(e => e.id));
  state.jobs = state.jobs.filter(j => !ids.has(j.id));
  state.applications = state.applications.filter(a => !(ids.has(a.jobId) && (a.status === 'skipped' || a.status === 'not_started')));
  return ids.size;
}
export const startedStatus = status => STARTED_STATUSES.has(status);
