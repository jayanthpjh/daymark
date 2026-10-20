// Bounded views of persisted state. Never return credentials, resume bodies or mail.
export function createAgentReadTools(readState) {
  return {
    open_application: async ({ jobId, section = 'form' } = {}) => {
      if (!['live', 'form', 'resume', 'cover', 'job', 'mail', 'timeline', 'prep'].includes(section)) throw new Error('Choose a supported application section.');
      const state = await readState();
      const job = state.jobs.find(j => j.id === jobId);
      if (!job) return { status: 'not_found' };
      return { navigation: { jobId: job.id, section }, company: job.company, role: job.role };
    },
    find_jobs: async ({ query = '' } = {}) => {
      const state = await readState();
      const needle = String(query).trim().toLowerCase();
      return { jobs: state.jobs.filter(j => `${j.company} ${j.role}`.toLowerCase().includes(needle)).slice(0, 20).map(j => ({ id: j.id, company: j.company, role: j.role })) };
    },
    application_status: async ({ jobId } = {}) => {
      const state = await readState();
      const job = state.jobs.find(j => j.id === jobId);
      if (!job) return { status: 'not_found' };
      return { jobId, company: job.company, role: job.role, tasks: state.tasks.filter(t => t.jobId === jobId).slice(0, 20).map(t => ({ id: t.id, type: t.type, status: t.status, stage: t.stage, reviewKind: t.reviewState?.kind, finalReviewReady: t.finalReviewReady === true, submissionOutcome: t.submissionOutcome })) };
    },
    list_questions: async () => {
      const state = await readState();
      return { applications: state.tasks.filter(t => t.status === 'needs_you').slice(0, 30).map(t => ({ taskId: t.id, jobId: t.jobId, reviewKind: t.reviewState?.kind, stage: t.stage })) };
    },
    // Private helper for trusted adapters that need bounded, paginated metadata only.
    tracker_page: async ({ cursor = 0, limit = 20 } = {}) => {
      const offset = Number(cursor);
      const size = Number(limit);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw new Error('Choose a valid tracker page.');
      if (!Number.isSafeInteger(size) || size < 1 || size > 50) throw new Error('Choose a page size from 1 to 50.');
      const state = await readState();
      const tasks = state.tasks.slice().sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
      const page = tasks.slice(offset, offset + size);
      const jobs = new Map(state.jobs.map(job => [job.id, job]));
      return {
        applications: page.map(task => {
          const job = jobs.get(task.jobId);
          return { taskId: task.id, jobId: task.jobId, company: job?.company || '', role: job?.role || '', type: task.type, status: task.status, stage: task.stage, updatedAt: task.updatedAt || task.createdAt || null, reviewKind: task.reviewState?.kind, finalReviewReady: task.finalReviewReady === true, submissionOutcome: task.submissionOutcome };
        }),
        nextCursor: offset + page.length < tasks.length ? String(offset + page.length) : null,
      };
    },
  };
}
