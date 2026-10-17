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
  };
}
