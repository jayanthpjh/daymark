import { Link, useNavigate } from 'react-router-dom';
import { CompanyLogo } from '@/components/CompanyLogo';
import { MatchRing } from '@/components/MatchRing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bookmark, Eye, MapPin, Plus, RefreshCw, Search, X } from 'lucide-react';
import { api, useApiMutation, useDaymarkState } from '@/api/client';
import { defaultJobFilters, filterJobs, jobDate, jobStatus, jobsForDisposition, paginateJobs } from '@/lib/ui-model';
import { FRESHNESS, LEVELS, TYPES, WORKPLACES, ROLE_FAMILIES, emptyPills, familyIdsOf, facetsOf, placeOf, tintIndex, type PillFilters } from '@/lib/job-facets';
import { Badge, Button, EmptyState, ErrorState, Input, SkeletonRows } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlays';
import { relTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { JobSourceLink } from '@/components/JobSourceLink';

const Pill = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={cn('h-8 rounded-full border px-3 text-xs font-semibold transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink hover:border-ink')}>{children}</button>
);
const Rule = () => <span aria-hidden className="mx-1 hidden h-6 w-px bg-line-strong sm:inline-block" />;
const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

export function Discover() {
  const q = useDaymarkState();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [pills, setPills] = useState<PillFilters>(emptyPills());
  const [days, setDays] = useState('');
  const [sort, setSort] = useState('newest');
  const [showClosed, setShowClosed] = useState(false);
  const [view, setView] = useState<'all'|'saved'|'passed'>('all');
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<Record<string, string>>({});
  const [confirmExpired, setConfirmExpired] = useState(false);
  const [expiredNote, setExpiredNote] = useState('');
  const [roleQuery, setRoleQuery] = useState('');
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const roleFilterRef = useRef<HTMLDetailsElement>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const prepare = useApiMutation((jobId: string) => api('/api/tasks', { jobId, resumeMode: 'tailored' }));
  const disposition = useApiMutation(({ jobId, status }: { jobId: string; status: 'saved'|'passed'|'active' }) => api(`/api/jobs/${encodeURIComponent(jobId)}/disposition`, { status }, 'PUT'));
  const collect = useApiMutation(() => api('/api/collect', {}));
  const expired = useQuery<{ count: number; closed: number; old: number; maxAgeDays: number }>({ queryKey: ['expired-jobs', q.data?.jobs.length], queryFn: () => api('/api/jobs/expired'), enabled: Boolean(q.data), retry: false });
  const age = days;
  const filters = { ...defaultJobFilters, search, location, age, sort, showClosed, pills };
  const jobDispositions = q.data?.jobDispositions || {};
  const viewJobs = useMemo(() => jobsForDisposition(q.data?.jobs || [], jobDispositions, view), [q.data?.jobs, jobDispositions, view]);
  const jobs = useMemo(() => filterJobs(viewJobs, filters, q.data?.tasks, q.data?.applications), [viewJobs, q.data?.tasks, q.data?.applications, search, location, age, sort, showClosed, pills]);
  const pg = paginateJobs(jobs, page, 24);
  const savedCount = Object.values(jobDispositions).filter(v => v === 'saved').length;
  const passedCount = Object.values(jobDispositions).filter(v => v === 'passed').length;
  const touched = Boolean(search || location || days || pills.levels.length || pills.workplaces.length || pills.types.length || pills.roleFamilies.length || pills.sponsors);
  const reset = () => { setSearch(''); setLocation(''); setDays(''); setPills(emptyPills()); setPage(1); };
  const change = (fn: () => void) => { fn(); setPage(1); };
  const closedCount = q.data?.jobs.filter((j: any) => j.closedAt).length ?? 0;
  const lastRun = q.data?.lastAtsCollection as string | undefined;
  const latestCollection = q.data?.tasks.filter((task: any) => task.type === 'collect').sort((a: any, b: any) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))[0];
  const noBoardsDue = /from 0 employer boards/.test(latestCollection?.message || '');
  const collectionActive = q.data?.tasks.some((task: any) => task.type === 'collect' && ['queued', 'running'].includes(task.status)) ?? false;
  const collectionState = useRef({ active: false, pending: false, hasRoles: false });
  const autoCollectStarted = useRef(false);
  const hasTargets = Boolean(q.data?.profile?.roleSearch?.trim() || q.data?.profile?.roleFamilies?.length);
  useEffect(() => {
    collectionState.current = { active: collectionActive, pending: collect.isPending, hasRoles: hasTargets };
  }, [collectionActive, collect.isPending, hasTargets]);
  const collectRef = useRef(collect.mutate);
  useEffect(() => { collectRef.current = collect.mutate; }, [collect.mutate]);
  useEffect(() => {
    if (!q.data || !collectionState.current.hasRoles || autoCollectStarted.current) return;
    autoCollectStarted.current = true;
    const refreshIfIdle = () => {
      const current = collectionState.current;
      if (!document.hidden && current.hasRoles && !current.active && !current.pending) collectRef.current();
    };
    refreshIfIdle();
    const timer = window.setInterval(refreshIfIdle, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', refreshIfIdle);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshIfIdle); };
  }, [Boolean(q.data), hasTargets]);
  useEffect(() => {
    if (!roleFilterOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (roleFilterRef.current) roleFilterRef.current.open = false; setRoleFilterOpen(false); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [roleFilterOpen]);
  const checkOpen = async (id: string) => { setChecked(c => ({ ...c, [id]: 'Checking…' })); try { const r = await api(`/api/jobs/${encodeURIComponent(id)}/check-open`, {}); setChecked(c => ({ ...c, [id]: r.status === 'open' ? 'Still open' : 'Could not confirm' })); } catch (e) { setChecked(c => ({ ...c, [id]: (e as Error).message })); } q.refetch(); };
  const removeExpired = async () => { try { const r = await api('/api/jobs/expired/remove', { confirmed: true }); setExpiredNote(`Removed ${r.removed} expired job${r.removed === 1 ? '' : 's'}. A backup was saved.`); q.refetch(); expired.refetch(); } catch (e) { setExpiredNote((e as Error).message); } };
  const importJob = async (event: React.FormEvent) => { event.preventDefault(); if (importing || !importUrl.trim()) return; setImporting(true); setImportMessage('Importing posting…'); try { await api('/api/jobs/import', { url: importUrl.trim() }); setImportUrl(''); setImportMessage('Job added.'); await q.refetch(); } catch (error) { setImportMessage((error as Error).message); } finally { setImporting(false); } };
  const addJobTile = <li className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm"><div className="flex min-h-[208px] flex-1 flex-col justify-center bg-tint-mint p-5"><Badge className="mb-3 w-fit bg-surface/80">Quick add</Badge><h2 className="text-xl font-medium tracking-tight">Add a job link</h2><p className="mt-2 text-sm text-muted">Import a role from an employer career page.</p><form className="mt-4 flex gap-2" onSubmit={importJob}><label htmlFor="add-job-url" className="sr-only">Job posting URL</label><Input id="add-job-url" type="url" required placeholder="https://…" value={importUrl} onChange={event => setImportUrl(event.target.value)} /><Button type="submit" size="icon" variant="primary" disabled={importing} aria-label="Import job link">{importing ? <RefreshCw size={15} className="animate-spin"/> : <Plus size={16}/>}</Button></form><p className="mt-2 min-h-4 text-xs text-muted" role="status">{importMessage}</p></div><div className="border-t border-line px-4 py-3 text-xs text-muted">Paste a posting URL to add it to your review queue.</div></li>;
  const activeFilters: { label: string; key: string; clear: () => void }[] = [];
  if (search) activeFilters.push({ label: `Search: ${search}`, key: 'search', clear: () => setSearch('') });
  if (location) activeFilters.push({ label: `Location: ${location}`, key: 'location', clear: () => setLocation('') });
  if (days) activeFilters.push({ label: FRESHNESS.find(f => String(f.days) === days)?.label || 'Freshness', key: 'age', clear: () => setDays('') });
  pills.roleFamilies.forEach(id => activeFilters.push({ label: ROLE_FAMILIES.find(f => f.id === id)?.label || 'Other', key: `family:${id}`, clear: () => setPills(p => ({ ...p, roleFamilies: p.roleFamilies.filter(value => value !== id) })) }));
  pills.levels.forEach(value => activeFilters.push({ label: value, key: `level:${value}`, clear: () => setPills(p => ({ ...p, levels: p.levels.filter(v => v !== value) })) }));
  pills.workplaces.forEach(value => activeFilters.push({ label: value, key: `workplace:${value}`, clear: () => setPills(p => ({ ...p, workplaces: p.workplaces.filter(v => v !== value) })) }));
  pills.types.forEach(value => activeFilters.push({ label: value, key: `type:${value}`, clear: () => setPills(p => ({ ...p, types: p.types.filter(v => v !== value) })) }));
  if (pills.sponsors) activeFilters.push({ label: 'Visa sponsorship', key: 'sponsors', clear: () => setPills(p => ({ ...p, sponsors: false })) });

  return (
    <div className="min-w-0">
      <header className="pb-4 pt-1">
        <h1 className="text-[28px] font-medium tracking-tight">Browse jobs</h1>
        <p className="mt-1 text-sm text-muted">Fresh roles from employers’ career pages, ranked for your resume.</p>
        <form role="search" className="mt-4 flex items-center gap-2 rounded-card border border-line bg-surface p-2 shadow-sm" onSubmit={e => e.preventDefault()}>
          <div className="relative min-w-0 flex-1"><Search size={16} aria-hidden className="absolute left-3 top-3 text-faint" /><Input aria-label="Search by title, company, or keyword" className="h-10 border-0 bg-transparent pl-9 shadow-none" placeholder="Search by title, company, or keyword…" value={search} onChange={e => change(() => setSearch(e.target.value))} /></div>
          <div className="relative hidden w-52 shrink-0 md:block"><MapPin size={14} aria-hidden className="absolute left-3 top-3 text-faint" /><Input aria-label="City, state, or country" className="h-10 rounded-control pl-8" placeholder="Location" value={location} onChange={e => change(() => setLocation(e.target.value))} /></div>
        </form>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3" role="group" aria-label="Filters">
        <details ref={roleFilterRef} className="role-family-filter relative" open={roleFilterOpen} onToggle={event => setRoleFilterOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary className={cn('flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand', pills.roleFamilies.length ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink')}>Role{pills.roleFamilies.length ? ` · ${pills.roleFamilies.length}` : ''}</summary>
          <div className="role-family-menu absolute left-0 top-10 z-30 w-80 rounded-card border border-line bg-surface p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between"><strong className="text-sm">Role families</strong><Button size="icon" variant="ghost" aria-label="Close role family filters" onClick={() => { if (roleFilterRef.current) roleFilterRef.current.open = false; setRoleFilterOpen(false); }}><X size={15}/></Button></div>
            <button type="button" tabIndex={-1} aria-hidden="true" className="role-filter-backdrop" onClick={() => { if (roleFilterRef.current) roleFilterRef.current.open = false; setRoleFilterOpen(false); }} />
            <label className="sr-only" htmlFor="discover-role-search">Search role families</label><Input id="discover-role-search" className="relative z-[1] h-9" placeholder="Search role families…" value={roleQuery} onChange={event => setRoleQuery(event.target.value)} />
            <div className="relative z-[1] mt-2 max-h-64 overflow-y-auto" role="group" aria-label="Role families">{ROLE_FAMILIES.filter(f => f.label.toLowerCase().includes(roleQuery.trim().toLowerCase())).map(f => <label key={f.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted-surface"><input type="checkbox" checked={pills.roleFamilies.includes(f.id)} onChange={() => change(() => setPills(p => ({ ...p, roleFamilies: toggle(p.roleFamilies, f.id) })))} />{f.label}</label>)}<label className="flex min-h-9 cursor-pointer items-center gap-2 rounded border-t border-line px-2 text-sm hover:bg-muted-surface"><input type="checkbox" checked={pills.roleFamilies.includes('other')} onChange={() => change(() => setPills(p => ({ ...p, roleFamilies: toggle(p.roleFamilies, 'other') })))} />Other / unclassified</label></div>
            <p className="mt-2 text-xs text-muted">Unknown roles remain searchable and appear under Other.</p>
          </div>
        </details>
        <div className="relative mr-1 md:hidden"><MapPin size={14} aria-hidden className="absolute left-3 top-2.5 text-faint" /><Input aria-label="City, state, or country" className="h-8 w-40 rounded-full pl-8" placeholder="Location" value={location} onChange={e => change(() => setLocation(e.target.value))} /></div>
        {LEVELS.map(l => <Pill key={l} on={pills.levels.includes(l)} onClick={() => change(() => setPills(p => ({ ...p, levels: toggle(p.levels, l) })))}>{l}</Pill>)}
        <Rule />{WORKPLACES.map(w => <Pill key={w} on={pills.workplaces.includes(w)} onClick={() => change(() => setPills(p => ({ ...p, workplaces: toggle(p.workplaces, w) })))}>{w}</Pill>)}
        <Rule />{TYPES.map(t => <Pill key={t} on={pills.types.includes(t)} onClick={() => change(() => setPills(p => ({ ...p, types: toggle(p.types, t) })))}>{t}</Pill>)}
        <Rule />{FRESHNESS.map(f => <Pill key={f.label} on={days === String(f.days)} onClick={() => change(() => setDays(d => (d === String(f.days) ? '' : String(f.days))))}>{f.label}</Pill>)}
        <Rule /><Pill on={pills.sponsors} onClick={() => change(() => setPills(p => ({ ...p, sponsors: !p.sponsors })))}>Sponsors Visa</Pill>
      </div>

      {activeFilters.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Active filters">{activeFilters.map(filter => <button key={filter.key} type="button" onClick={() => change(filter.clear)} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">{filter.label}<X size={12} aria-hidden/><span className="sr-only">Remove filter</span></button>)}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span aria-live="polite" className="mr-1 font-medium text-ink">{q.data ? `${jobs.length.toLocaleString()} job${jobs.length === 1 ? '' : 's'}` : 'Loading…'}</span>
        <div className="flex rounded-control bg-muted-surface p-1" role="tablist" aria-label="Job lists">{([['all','All jobs',undefined],['saved','Saved',savedCount],['passed','Passed',passedCount]] as const).map(([key,label,count])=><button key={key} type="button" role="tab" aria-selected={view===key} className={cn('h-8 rounded-control px-3 text-xs font-medium',view===key?'bg-surface text-ink shadow-sm':'text-muted hover:text-ink')} onClick={()=>{setView(key);setPage(1);}}>{label}{count!==undefined&&<span className="ml-1 text-faint">{count}</span>}</button>)}</div>
        <span className="hidden sm:inline">{lastRun ? `Updated ${relTime(lastRun)}` : 'Not collected yet'}</span>
        <Button size="sm" variant="primary" className="ml-auto" disabled={collect.isPending || collectionActive} aria-busy={collect.isPending || collectionActive} onClick={() => collect.mutate()}><RefreshCw size={14} className={collectionActive?'animate-spin':''}/>{collectionActive ? 'Refreshing…' : collect.isPending ? 'Starting…' : 'Refresh feed'}</Button>
        <label className="ml-auto flex items-center gap-2">Sort<select aria-label="Sort" className="h-9 rounded-control border border-control bg-surface px-2" value={sort} onChange={e => change(() => setSort(e.target.value))}><option value="newest">Newest</option><option value="match">Best match</option><option value="recommended">Recommended</option></select></label>
        {closedCount > 0 && <label className="flex items-center gap-2"><input type="checkbox" checked={showClosed} onChange={e => change(() => setShowClosed(e.target.checked))} />Show {closedCount} closed</label>}
        {touched && <button type="button" className="font-medium text-ink underline" onClick={reset}>Clear all</button>}
      </div>

      {(expired.data?.count ?? 0) > 0 && <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3 text-sm"><span>{expired.data!.count} expired job{expired.data!.count === 1 ? '' : 's'} ({expired.data!.closed} closed by the employer, {expired.data!.old} older than {expired.data!.maxAgeDays} days). Jobs you started are never included.</span><Button size="sm" variant="danger" onClick={() => setConfirmExpired(true)}>Remove expired</Button></div>}
      {expiredNote && <p role="status" className="mt-3 text-sm text-muted">{expiredNote}</p>}
      <ConfirmDialog open={confirmExpired} onOpenChange={setConfirmExpired} danger title="Remove expired jobs?" description="They are removed from Discover. A backup of everything is saved first. Jobs you started an application for are kept." confirmLabel="Remove expired" onConfirm={removeExpired} />
      {collect.isError && <p role="alert" className="mt-3 text-sm text-danger">Could not collect jobs: {(collect.error as Error).message}</p>}

      <p className="mt-2 text-xs text-faint" aria-live="polite">Automatically refreshes when you open Discover and every 5 minutes while it’s visible.</p>
      {collectionActive && latestCollection && <div role="status" aria-live="polite" className="mt-3 flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2 text-sm text-muted"><RefreshCw size={15} className="shrink-0 animate-spin text-brand" aria-hidden/><span className="min-w-0 flex-1 truncate">{latestCollection.message || 'Looking for new roles…'}</span><progress className="h-1.5 w-20 accent-[var(--color-brand)]" max={100} value={latestCollection.progress || 0} aria-label="Collection progress" /></div>}

      <div className="mt-4">
        {q.isLoading ? <SkeletonRows rows={6} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : jobs.length === 0 ? <>{view === 'all' && <ul className="job-card-grid mb-4" aria-label="Add a job">{addJobTile}</ul>}<EmptyState title={view==='saved'?'No saved jobs yet':view==='passed'?'No passed jobs':age && q.data?.jobs.length ? `No jobs in ${FRESHNESS.find(f => String(f.days) === age)?.label.toLowerCase() || 'this time window'}` : 'No roles match'} description={view==='saved'?'Save interesting roles to keep them together here.':view==='passed'?'Passed roles stay here until you restore them.':age && q.data?.jobs.length ? noBoardsDue ? `No listings were posted or first seen ${FRESHNESS.find(f => String(f.days) === age)?.label.toLowerCase() || 'in this time window'}, and no employer boards were due in the latest scan. Try a longer window or check back after the next refresh.` : `No listings were posted or first seen ${FRESHNESS.find(f => String(f.days) === age)?.label.toLowerCase() || 'in this time window'}. Try a longer window or check back after the next refresh.` : q.data?.jobs.length ? 'Try fewer filters, or a longer freshness window.' : 'No roles collected yet. Collection runs on its own; check back soon.'} /></> : (
          <ul className="job-card-grid" aria-label="Job opportunities">{addJobTile}{pg.items.map((job: any) => {
            const st = jobStatus(job, q.data!.tasks, q.data!.applications);
            const started = st !== 'not_started';
            const postedAt = jobDate(job);
            const f = facetsOf(job);
            const familyIds = familyIdsOf(job);
            const familyLabels = ROLE_FAMILIES.filter(family => familyIds.includes(family.id)).map(family => family.label);
            const tags = [f.level, f.workplace, ...f.skills].filter(Boolean);
            const saved = jobDispositions[job.id] === 'saved';
            const passed = jobDispositions[job.id] === 'passed';
            return (
              <li key={job.id} data-job-card className={cn('flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm transition-shadow hover:shadow-md focus-within:shadow-md', job.closedAt && 'opacity-70')}>
                <div className={cn('relative flex min-h-[208px] flex-1 flex-col p-4 text-ink', `tint-${tintIndex(job.company)}`)}>
                  <div className="flex items-start justify-between gap-2 text-xs text-muted"><span className="min-w-0 truncate">{placeOf(job) || 'Location not listed'}</span><span className="shrink-0">{postedAt ? relTime(postedAt) : 'Date unknown'}</span></div>
                  <div className="absolute right-3 top-10"><MatchRing value={job.match} size={44} why={job.matchWhy || []}/></div>
                  {f.workplace && <Badge className="mt-2 w-fit bg-surface/80">{f.workplace}</Badge>}
                  <h2 className="mt-3 max-w-[calc(100%-44px)] text-[18px] font-medium leading-snug tracking-tight"><Link to={`/discover/${encodeURIComponent(job.id)}`} className="rounded-sm focus-visible:outline-offset-4">{job.role}</Link></h2>
                  {job.salary && <span className="mt-2 w-fit rounded-full bg-surface/80 px-2.5 py-0.5 text-xs font-semibold text-ink">{String(job.salary).replace(/\s+/g, ' ').slice(0, 28)}</span>}
                  <Badge className="mt-3 w-fit max-w-full truncate bg-surface/80">{familyLabels[0] || 'Other'}</Badge>
                  {tags.length > 0 && <ul className="mt-auto flex flex-wrap gap-1.5 pt-4" aria-label="Level and skills">{tags.slice(0, 4).map((t, i) => <li key={t} className={cn('max-w-full truncate rounded-full px-2 py-0.5 text-[11px]', i === 0 && f.level ? 'bg-surface font-medium' : 'bg-surface/70')}>{t}</li>)}{tags.length > 4 && <li className="px-1 py-0.5 text-[11px] text-muted">+{tags.length - 4}</li>}</ul>}
                  {job.closedAt && <Badge className="mt-2 w-fit" tone="danger">Closed</Badge>}
                </div>
                <div className="flex items-center gap-2 border-t border-line px-3 py-2">
                  <Button size="sm" variant="ghost" aria-pressed={saved} disabled={disposition.isPending} onClick={() => disposition.mutate({jobId:job.id,status:saved?'active':'saved'})}><Bookmark size={14} className={saved?'fill-current':''}/>{saved?'Saved':'Save'}</Button>
                  <Button asChild size="sm" variant="ghost"><Link to={`/discover/${encodeURIComponent(job.id)}`}><Eye size={14}/>Details</Link></Button>
                </div>
                <div className="flex min-w-0 items-center gap-2 border-t border-line px-3 py-3">
                  <CompanyLogo company={job.company} logoUrl={job.logoUrl} jobId={job.id}/>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{job.company}</span><JobSourceLink job={job} className="mt-0.5 text-[11px]"/>{checked[job.id]&&<span role="status" className="block text-[11px] text-muted">{checked[job.id]}</span>}</span>
                  {passed ? <Button size="sm" variant="ghost" disabled={disposition.isPending} onClick={()=>disposition.mutate({jobId:job.id,status:'active'})}><X size={14}/>Restore</Button> : <Button size="sm" variant="ghost" disabled={disposition.isPending} onClick={()=>disposition.mutate({jobId:job.id,status:'passed'})}>Pass</Button>}
                  {started ? <Button asChild size="sm" variant="primary"><Link to={`/applications/${job.id}`}>Continue</Link></Button> : <Button size="sm" variant="primary" disabled={prepare.isPending || Boolean(job.closedAt)} onClick={() => prepare.mutate(job.id,{onSuccess:()=>navigate(`/applications/${job.id}`)})}>{prepare.isPending ? 'Preparing…' : 'Apply'}</Button>}
                  {!started && !job.closedAt && String(job.id).startsWith('ats-') && <Button size="icon" variant="ghost" aria-label={`Check that ${job.role} at ${job.company} is still open`} onClick={() => checkOpen(job.id)}><ArrowUpRight size={15} /></Button>}
                </div>
              </li>);
          })}</ul>)}
        {prepare.isError && <p role="alert" className="mt-3 text-danger">{(prepare.error as Error).message}</p>}
        {pg.pages > 1 && <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3"><Button size="sm" disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)}>Previous</Button><span className="text-muted">Page {pg.page} of {pg.pages}</span><Button size="sm" disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)}>Next</Button></nav>}
      </div>
    </div>
  );
}
