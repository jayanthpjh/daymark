import { describe, expect, it } from 'vitest';
import { defaultJobFilters, filterJobs } from '../ui-model';

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
