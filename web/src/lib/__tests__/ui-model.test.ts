import { describe, expect, it } from 'vitest';
import { defaultJobFilters, filterJobs, jobsForDisposition, jobStatus } from '../ui-model';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const job = (id: string, extra: Record<string, unknown> = {}) => ({ id, company: 'Acme', role: 'Data Engineer', tags: [], location: 'Remote', posted: day(2), ...extra });
const run = (jobs: any[], filters: Partial<typeof defaultJobFilters> = {}) => filterJobs(jobs, { ...defaultJobFilters, ...filters }, [], [], NOW).map((j: any) => j.id);

describe('closed jobs', () => {
  it('are hidden by default and shown with the toggle', () => {
    const jobs = [job('open'), job('gone', { closedAt: day(1) })];
    expect(run(jobs)).toEqual(['open']);
    expect(run(jobs, { showClosed: true }).sort()).toEqual(['gone', 'open']);
  });
});
describe('application status', () => {
  it('shows the latest waiting task instead of a stale manual application status', () => {
    const waiting = { jobId: 'capital-one', type: 'fill', status: 'needs_you', updatedAt: day(0) };
    const stale = { jobId: 'capital-one', status: 'in_progress', updatedAt: day(1) };
    expect(jobStatus(job('capital-one'), [waiting], [stale])).toBe('needs_you');
  });
  it('keeps a user-marked application disposition after its tasks are paused', () => {
    expect(jobStatus(job('capital-one'), [{ jobId: 'capital-one', type: 'fill', status: 'paused' }], [{ jobId: 'capital-one', status: 'not_started' }])).toBe('not_started');
  });
});
describe('age filter', () => {
  const jobs = [job('new', { posted: day(3) }), job('mid', { posted: day(20) }), job('old', { posted: day(90) }), job('undated', { posted: '', first_seen_at: day(2) })];
  it('keeps postings inside the limit, by posted date', () => {
    expect(run(jobs, { age: '30' }).sort()).toEqual(['mid', 'new', 'undated']);
    expect(run(jobs, { age: '7' }).sort()).toEqual(['new', 'undated']);
  });
  it('shows everything when the filter is empty', () => {
    expect(run(jobs, { age: '' })).toHaveLength(4);
  });
  it('falls back to when Daymark first saw an undated posting', () => {
    expect(run([job('x', { posted: '', first_seen_at: day(60) })], { age: '30' })).toEqual([]);
  });
});

describe('freshness filters', () => {
  const hours = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
  const jobs = [job('hot', { posted: hours(3), last_seen_at: hours(1) }), job('day', { posted: hours(20), last_seen_at: hours(20) }), job('week', { posted: hours(24 * 5), last_seen_at: hours(30) })];
  it('filters by how recently a job was posted, down to 6 hours', () => {
    expect(run(jobs, { age: '0.25' })).toEqual(['hot']);
    expect(run(jobs, { age: '1' }).sort()).toEqual(['day', 'hot']);
    expect(run(jobs, { age: '7' })).toHaveLength(3);
  });
  it('filters by how recently the employer listing confirmed the job is open', () => {
    expect(run(jobs, { seen: '2' })).toEqual(['hot']);
    expect(run(jobs, { seen: '24' }).sort()).toEqual(['day', 'hot']);
    expect(run(jobs, { seen: '72' })).toHaveLength(3);
  });
  it('a job never confirmed open does not pass a confirmed-open filter', () => {
    expect(run([job('never', { posted: hours(1) })], { seen: '72' })).toEqual([]);
  });
});

describe('saved and passed jobs', () => {
  const jobs = [job('open'), job('saved'), job('passed')];
  const dispositions = { saved: 'saved' as const, passed: 'passed' as const };
  it('hides passed jobs from the default feed while keeping saved roles visible', () => {
    expect(jobsForDisposition(jobs, dispositions).map(j => j.id)).toEqual(['open', 'saved']);
  });
  it('shows the saved and passed views and supports restoring a passed role', () => {
    expect(jobsForDisposition(jobs, dispositions, 'saved').map(j => j.id)).toEqual(['saved']);
    expect(jobsForDisposition(jobs, dispositions, 'passed').map(j => j.id)).toEqual(['passed']);
    expect(jobsForDisposition(jobs, { saved: 'saved' }, 'all').map(j => j.id)).toEqual(['open', 'saved', 'passed']);
  });
});
