import type { DaymarkState, Job, Task } from './types';
import { jobStatus, jobDate } from './ui-model';
import { applicationRun, applicationStatuses } from './application-model';
import { isAwaitingReview } from './stream-model';
import type { Tone } from '@/components/ui/primitives';

const labels = new Map<string, string>([...(applicationStatuses as [string, string][]), ['queued', 'Queued'], ['running', 'Running'], ['needs_you', 'Needs you'], ['paused', 'Paused'], ['cancelled', 'Cancelled'], ['ready_for_review', 'Ready for review'], ['completed', 'Prepared']]);
export const statusLabel = (s: string) => labels.get(s) ?? s.replaceAll('_', ' ');
export function statusTone(s: string): Tone {
  if (['submitted', 'interview', 'offer', 'completed'].includes(s)) return 'success';
  if (['failed', 'unconfirmed', 'rejected'].includes(s)) return 'danger';
  if (['needs_you', 'paused', 'ready_for_review', 'screening'].includes(s)) return 'warning';
  if (['queued', 'running', 'in_progress'].includes(s)) return 'info';
  return 'neutral';
}

export interface AppRow { id: string; job: Job; status: string; stage: string; progress: number; match: number | null; mode: string; lastActivity: string; task?: Task; next: string }

export function applicationRows(state: DaymarkState): AppRow[] {
  const tasks = state.tasks || [], apps = state.applications || [];
  const rows: AppRow[] = [];
  for (const job of state.jobs || []) {
    const hasWork = tasks.some(t => t.jobId === job.id && t.type !== 'collect') || apps.some(a => a.jobId === job.id);
    if (!hasWork) continue;
    const run = applicationRun(tasks, job.id);
    const status = jobStatus(job, tasks, apps);
    const task = run.fill || run.prepare || run.current;
    const app = apps.find(a => a.jobId === job.id);
    const last = task?.updatedAt || app?.updatedAt || task?.createdAt || '';
    rows.push({ id: job.id, job, status, stage: task?.stage || statusLabel(status), progress: run.progress, match: job.match ?? null, mode: run.prepare?.tailoringMode || run.prepare?.review?.mode || '—', lastActivity: last, task, next: nextAction(status, run.fill, run.prepare) });
  }
  return rows.sort((a, b) => Date.parse(b.lastActivity || '') - Date.parse(a.lastActivity || ''));
}

function nextAction(status: string, fill?: Task, prepare?: Task) {
  if (status === 'not_started') return '—';
  if (status === 'cancelled' || status === 'paused') return '—';
  if (fill && isAwaitingReview(fill)) return 'Review and send';
  if (fill?.status === 'needs_you') {
    if (isAnswerCheckpoint(fill)) return 'Answer questions';
    if (fill.checkpoint?.pauseReason === 'verification') return 'Verify with employer';
    if (fill.reviewState?.kind === 'authentication_required' || fill.checkpoint?.pauseReason === 'entry') return 'Sign in to continue';
    return 'Continue application';
  }
  if (prepare?.hasArtifacts && prepare.review?.approvalStatus !== 'approved') return 'Review resume';
  if (status === 'failed') return 'Retry';
  if (['queued', 'running', 'in_progress'].includes(status)) return 'Wait';
  return '—';
}

function isAnswerCheckpoint(task: Task) {
  return task.reviewState?.kind === 'answers_needed' || task.checkpoint?.pauseReason === 'answers' || Boolean(task.checkpoint?.unresolvedIds?.length);
}

export interface NeedsYou { id: string; jobId?: string; title: string; detail: string; urgency: number; href: string }
export function needsYou(state: DaymarkState): NeedsYou[] {
  const jobs = new Map((state.jobs || []).map(j => [j.id, j]));
  const items: NeedsYou[] = [];
  for (const t of state.tasks || []) {
    if (t.type === 'collect') continue;
    const j = jobs.get(t.jobId || '');
    const name = `${j?.company || t.company || 'Company'} · ${j?.role || t.role || 'Role'}`;
    if (isAwaitingReview(t)) items.push({ id: t.id, jobId: t.jobId, title: name, detail: 'Filled and ready: review before submit', urgency: 1, href: `/applications/${t.jobId}` });
    else if (t.status === 'needs_you') {
      const answers = isAnswerCheckpoint(t);
      const detail = answers ? t.message || `${t.checkpoint?.unresolvedIds?.length || 'Some'} question(s) need your answer` : t.message || (t.checkpoint?.pauseReason === 'verification' ? 'Employer verification needed' : 'Continue this step in the application workspace');
      items.push({ id: t.id, jobId: t.jobId, title: name, detail, urgency: t.checkpoint?.pauseReason === 'verification' ? 1 : 2, href: answers ? '/questions' : `/applications/${t.jobId}` });
    }
    else if (t.status === 'failed') items.push({ id: t.id, jobId: t.jobId, title: name, detail: 'Failed: open to retry', urgency: 3, href: `/applications/${t.jobId}` });
  }
  return items.sort((a, b) => a.urgency - b.urgency);
}

export const matchTone = (m: number | null): Tone => m == null ? 'neutral' : m >= 75 ? 'success' : m >= 50 ? 'warning' : 'neutral';
export { jobDate };
