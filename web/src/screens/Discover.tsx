import { Link } from 'react-router-dom';
import { CompanyLogo } from '@/components/CompanyLogo';
import { MatchRing } from '@/components/MatchRing';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, MapPin, Search } from 'lucide-react';
import { api, useApiMutation, useDaymarkState } from '@/api/client';
import { defaultJobFilters, filterJobs, jobStatus, paginateJobs } from '@/lib/ui-model';
import { FRESHNESS, LEVELS, TYPES, WORKPLACES, emptyPills, facetsOf, placeOf, tintIndex, type PillFilters } from '@/lib/job-facets';
import { Badge, Button, EmptyState, ErrorState, Input, SkeletonRows } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlays';
import { relTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const Pill = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={cn('h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink hover:border-ink')}>{children}</button>
);
const Rule = () => <span aria-hidden className="mx-1 hidden h-6 w-px bg-line-strong sm:inline-block" />;
const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

export function Discover() {
  const q = useDaymarkState();
  const saved = q.data?.preferences?.jobPulling ?? { scheduleMinutes: 60, maxAgeDays: 7 };
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [pills, setPills] = useState<PillFilters>(emptyPills());
  const [days, setDays] = useState('saved');
  const [sort, setSort] = useState('newest');
  const [showClosed, setShowClosed] = useState(false);
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<Record<string, string>>({});
  const [confirmExpired, setConfirmExpired] = useState(false);
  const [expiredNote, setExpiredNote] = useState('');
  const prepare = useApiMutation((jobId: string) => api('/api/tasks', { jobId, resumeMode: 'tailored' }));
  const savePulling = useApiMutation((patch: Record<string, number>) => api('/api/preferences', { jobPulling: patch }));
  const expired = useQuery<{ count: number; closed: number; old: number; maxAgeDays: number }>({ queryKey: ['expired-jobs', q.data?.jobs.length], queryFn: () => api('/api/jobs/expired'), enabled: Boolean(q.data), retry: false });
  const age = days === 'saved' ? (saved.maxAgeDays ? String(saved.maxAgeDays) : '') : days;
  const filters = { ...defaultJobFilters, search, location, age, sort, showClosed, pills };
  const jobs = useMemo(() => (q.data ? filterJobs(q.data.jobs, filters, q.data.tasks, q.data.applications) : []), [q.data, search, location, age, sort, showClosed, pills]);
  const pg = paginateJobs(jobs, page, 24);
  const touched = Boolean(search || location || days !== 'saved' || pills.levels.length || pills.workplaces.length || pills.types.length || pills.sponsors);
  const reset = () => { setSearch(''); setLocation(''); setDays('saved'); setPills(emptyPills()); setPage(1); };
  const change = (fn: () => void) => { fn(); setPage(1); };
  const closedCount = q.data?.jobs.filter((j: any) => j.closedAt).length ?? 0;
  const lastRun = q.data?.lastAtsCollection as string | undefined;
  const checkOpen = async (id: string) => { setChecked(c => ({ ...c, [id]: 'Checking…' })); try { const r = await api(`/api/jobs/${encodeURIComponent(id)}/check-open`, {}); setChecked(c => ({ ...c, [id]: r.status === 'open' ? 'Still open' : 'Could not confirm' })); } catch (e) { setChecked(c => ({ ...c, [id]: (e as Error).message })); } q.refetch(); };
  const removeExpired = async () => { try { const r = await api('/api/jobs/expired/remove', { confirmed: true }); setExpiredNote(`Removed ${r.removed} expired job${r.removed === 1 ? '' : 's'}. A backup was saved.`); q.refetch(); expired.refetch(); } catch (e) { setExpiredNote((e as Error).message); } };

  return (
    <div className="min-w-0">
      <header className="mx-auto max-w-2xl pb-6 pt-2 text-center">
        <h1 className="text-[34px] font-medium tracking-tight">Jobs</h1>
        <p className="mt-2 text-muted">Fresh roles from the employers' own career pages, ranked for your resume.</p>
        <form role="search" className="mt-5 flex items-center gap-3" onSubmit={e => e.preventDefault()}>
          <div className="relative flex-1"><Search size={16} aria-hidden className="absolute left-3 top-3 text-faint" /><Input aria-label="Search by job title or company" className="h-11 rounded-full pl-9" placeholder="Search by job title or company…" value={search} onChange={e => change(() => setSearch(e.target.value))} /></div>
        </form>
      </header>

      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2" role="group" aria-label="Filters">
        <div className="relative"><MapPin size={14} aria-hidden className="absolute left-3 top-3 text-faint" /><Input aria-label="City, state, or country" className="h-9 w-48 rounded-full pl-8" placeholder="City, state, or country" value={location} onChange={e => change(() => setLocation(e.target.value))} /></div>
        <Rule />{LEVELS.map(l => <Pill key={l} on={pills.levels.includes(l)} onClick={() => change(() => setPills(p => ({ ...p, levels: toggle(p.levels, l) })))}>{l}</Pill>)}
        <Rule />{WORKPLACES.map(w => <Pill key={w} on={pills.workplaces.includes(w)} onClick={() => change(() => setPills(p => ({ ...p, workplaces: toggle(p.workplaces, w) })))}>{w}</Pill>)}
        <Rule />{TYPES.map(t => <Pill key={t} on={pills.types.includes(t)} onClick={() => change(() => setPills(p => ({ ...p, types: toggle(p.types, t) })))}>{t}</Pill>)}
        <Rule />{FRESHNESS.map(f => <Pill key={f.label} on={days === String(f.days)} onClick={() => change(() => setDays(d => (d === String(f.days) ? 'saved' : String(f.days))))}>{f.label}</Pill>)}
        <Rule /><Pill on={pills.sponsors} onClick={() => change(() => setPills(p => ({ ...p, sponsors: !p.sponsors })))}>Sponsors Visa</Pill>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-b border-line pb-3 text-sm text-muted">
        <span aria-live="polite" className="font-medium text-ink">{q.data ? `${jobs.length.toLocaleString()} job${jobs.length === 1 ? '' : 's'}` : 'Loading…'}</span>
        <span className="hidden sm:inline">{lastRun ? `Last collected ${relTime(lastRun)}` : 'Not collected yet'}</span>
        <label className="ml-auto flex items-center gap-2">Sort<select aria-label="Sort" className="h-9 rounded-control border border-control bg-surface px-2" value={sort} onChange={e => change(() => setSort(e.target.value))}><option value="newest">Newest</option><option value="match">Best match</option><option value="recommended">Recommended</option></select></label>
        {closedCount > 0 && <label className="flex items-center gap-2"><input type="checkbox" checked={showClosed} onChange={e => change(() => setShowClosed(e.target.checked))} />Show {closedCount} closed</label>}
        {touched && <button type="button" className="font-medium text-ink underline" onClick={reset}>Clear all</button>}
      </div>

      {(expired.data?.count ?? 0) > 0 && <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3 text-sm"><span>{expired.data!.count} expired job{expired.data!.count === 1 ? '' : 's'} ({expired.data!.closed} closed by the employer, {expired.data!.old} older than {expired.data!.maxAgeDays} days). Jobs you started are never included.</span><Button size="sm" variant="danger" onClick={() => setConfirmExpired(true)}>Remove expired</Button></div>}
      {expiredNote && <p role="status" className="mt-3 text-sm text-muted">{expiredNote}</p>}
      <ConfirmDialog open={confirmExpired} onOpenChange={setConfirmExpired} danger title="Remove expired jobs?" description="They are removed from Discover. A backup of everything is saved first. Jobs you started an application for are kept." confirmLabel="Remove expired" onConfirm={removeExpired} />

      <details className="mt-3 text-sm text-muted">
        <summary className="cursor-pointer select-none">Collection settings</summary>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2">Collect every<select aria-label="Collection interval" className="h-9 rounded-control border border-control bg-surface px-2" value={saved.scheduleMinutes} onChange={e => savePulling.mutate({ scheduleMinutes: Number(e.target.value) })}><option value={0}>Off (press Collect)</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={360}>6 hours</option></select></label>
          <label className="flex items-center gap-2">Keep postings from the last<select aria-label="Maximum posting age" className="h-9 rounded-control border border-control bg-surface px-2" value={saved.maxAgeDays} onChange={e => savePulling.mutate({ maxAgeDays: Number(e.target.value) })}><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={0}>No limit</option></select></label>
          {savePulling.isError && <span role="alert" className="text-danger">{(savePulling.error as Error).message}</span>}
        </div>
      </details>

      <div className="mt-5">
        {q.isLoading ? <SkeletonRows rows={6} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : jobs.length === 0 ? <EmptyState title="No roles match" description={q.data?.jobs.length ? 'Try fewer filters, or a longer freshness window.' : 'No roles collected yet. Collection runs on its own; check back soon.'} /> : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Job opportunities">{pg.items.map((job: any) => {
            const st = jobStatus(job, q.data!.tasks, q.data!.applications);
            const started = st !== 'not_started';
            const f = facetsOf(job);
            const tags = [f.level, ...f.skills].filter(Boolean);
            return (
              <li key={job.id} className={cn('relative flex min-w-0 flex-col rounded-[20px] p-5 text-ink transition-shadow hover:shadow-md focus-within:shadow-md', `tint-${tintIndex(job.company)}`, job.closedAt && 'opacity-70')}>
                <div className="mb-3 flex items-start justify-between gap-3 text-[13px] text-muted">
                  <span className="min-w-0 truncate">{placeOf(job) || 'Location not listed'}</span>
                  <span className="flex shrink-0 items-center gap-2">{job.salary && <span className="rounded-full bg-surface px-2.5 py-0.5 font-semibold text-ink">{String(job.salary).replace(/\s+/g, ' ').slice(0, 24)}</span>}<span>{job.posted ? relTime(job.posted) : 'New'}</span></span>
                </div>
                <h2 className="text-[21px] font-medium leading-snug tracking-tight"><Link to={`/discover/${encodeURIComponent(job.id)}`} className="after:absolute after:inset-0 after:rounded-[20px] focus-visible:outline-none">{job.role}</Link></h2>
                {tags.length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Level and skills">{tags.slice(0, 4).map((t, i) => <li key={t} className={cn('rounded-full px-2.5 py-0.5 text-[12px]', i === 0 && f.level ? 'bg-surface font-medium' : 'bg-surface/70')}>{t}</li>)}{tags.length > 4 && <li className="px-1 py-0.5 text-[12px] text-muted">+{tags.length - 4}</li>}</ul>}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-ink/10 pt-4">
                  <span className="flex min-w-[9rem] flex-1 items-center gap-2"><CompanyLogo company={job.company} logoUrl={job.logoUrl} jobId={job.id} /><span className="min-w-0"><span className="block truncate font-semibold">{job.company}</span>{job.closedAt && <Badge tone="danger">Closed</Badge>}{checked[job.id] && <span role="status" className="block text-[12px] text-muted">{checked[job.id]}</span>}</span></span>
                  <span className="relative z-10 flex shrink-0 items-center gap-2">
                    <MatchRing value={job.match} />
                    {started ? <Button asChild size="sm"><Link to={`/applications/${job.id}`}>View</Link></Button> : <Button size="sm" variant="primary" disabled={prepare.isPending || Boolean(job.closedAt)} onClick={() => prepare.mutate(job.id)}>Prepare</Button>}
                    {!started && !job.closedAt && String(job.id).startsWith('ats-') && <Button size="icon" variant="ghost" aria-label={`Check that ${job.role} at ${job.company} is still open`} onClick={() => checkOpen(job.id)}><ArrowUpRight size={15} /></Button>}
                  </span>
                </div>
              </li>);
          })}</ul>)}
        {prepare.isError && <p role="alert" className="mt-3 text-danger">{(prepare.error as Error).message}</p>}
        {pg.pages > 1 && <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3"><Button size="sm" disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)}>Previous</Button><span className="text-muted">Page {pg.page} of {pg.pages}</span><Button size="sm" disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)}>Next</Button></nav>}
      </div>
    </div>
  );
}
