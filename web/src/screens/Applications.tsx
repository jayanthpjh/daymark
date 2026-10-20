import { applicationPresentationModel, applicationStatuses } from '@/lib/application-model';
import { Activity, Clock3 } from 'lucide-react';
import { CompanyLogo } from '@/components/CompanyLogo';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Pause, Play, Search, X } from 'lucide-react';
import { api, useApiMutation, useDaymarkState } from '@/api/client';
import { applicationRows, matchTone, statusLabel, statusTone } from '@/lib/derive';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';
import { relTime } from '@/lib/format';
import { cn } from '@/lib/cn';

type View = { name: string; status: string; search: string };
const builtIn: View[] = [{ name: 'All', status: '', search: '' }, { name: 'Needs you', status: 'needs_you', search: '' }, { name: 'In flight', status: 'running', search: '' }, { name: 'Submitted', status: 'submitted', search: '' }];
const load = (): View[] => { try { return JSON.parse(localStorage.getItem('dm.views') || '[]'); } catch { return []; } };

export function Applications() {
  const q = useDaymarkState();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [views, setViews] = useState<View[]>(load);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [nameOpen, setNameOpen] = useState(false); const [viewName, setViewName] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [alsoJobs, setAlsoJobs] = useState(false);
  const [removeNote, setRemoveNote] = useState<{ error?: string; needsSubmitted?: boolean; done?: string }>({});
  const [busy, setBusy] = useState(false);
  const setStatusFor = useApiMutation(({ jobId, status }: { jobId: string; status: string }) => api(`/api/applications/${encodeURIComponent(jobId)}/status`, { status }));
  const removeSelected = async (includeSubmitted = false) => {
    setBusy(true); setRemoveNote({});
    try {
      const r = await api('/api/applications/remove', { confirmed: true, jobIds: [...selected], alsoRemoveJobs: alsoJobs, includeSubmitted });
      setRemoveNote({ done: `Removed ${r.removed.applications} application${r.removed.applications === 1 ? '' : 's'}. A backup was saved (${r.backup}).` });
      setSelected(new Set()); q.refetch();
    } catch (e: any) {
      setRemoveNote(e?.status === 409 && e?.message?.includes('Confirm again') ? { error: e.message, needsSubmitted: true } : { error: e?.message || 'Could not remove.' });
    } finally { setBusy(false); }
  };
  const action = useApiMutation(({ id, a }: { id: string; a: string }) => api(`/api/tasks/${id}/${a}`, {}));
  useEffect(() => { try { localStorage.setItem('dm.views', JSON.stringify(views)); } catch { /* ignore */ } }, [views]);

  const rows = useMemo(() => q.data ? applicationRows(q.data) : [], [q.data]);
  const shown = [...rows].sort((a,b)=>(a.status==='needs_you'?-1:0)-(b.status==='needs_you'?-1:0)).filter(r => (!status || (status === 'running' ? ['queued', 'running', 'in_progress'].includes(r.status) : r.status === status)) && (!search || `${r.job.company} ${r.job.role}`.toLowerCase().includes(search.toLowerCase())));
  const statuses = [...new Set(rows.map(r => r.status))];
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulk = (a: string) => { shown.filter(r => selected.has(r.id) && r.task).forEach(r => action.mutate({ id: r.task!.id, a })); setSelected(new Set()); };
  

  return (
    <>
      <PageHeader title="Applications" description={`${rows.length} tracked`} actions={<Button asChild variant="primary"><Link to="/discover">Find roles</Link></Button>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[...builtIn, ...views].map(v => <button key={v.name} type="button" aria-pressed={status === v.status && search === v.search} onClick={() => { setStatus(v.status); setSearch(v.search); }} className={cn('h-8 rounded-full border px-3 text-[12.5px] font-medium', status === v.status && search === v.search ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:bg-muted-surface')}>{v.name}</button>)}
        <Button size="sm" variant="ghost" onClick={() => setNameOpen(true)}><Bookmark size={14} />Save view</Button>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-card border border-line bg-surface p-3">
          <div className="relative min-w-[200px] flex-1 md:max-w-xs"><Search size={14} className="absolute left-3 top-3 text-faint md:top-2.5" aria-hidden /><Input aria-label="Filter applications" placeholder="Filter company or role" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)} className="h-10 rounded-control border border-line-strong bg-surface px-2 md:h-9"><option value="">All statuses</option>{statuses.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
          <label className="flex items-center gap-2 text-muted"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" aria-label="Select all shown" checked={shown.length > 0 && shown.every(r => selected.has(r.id))} onChange={e => setSelected(e.target.checked ? new Set(shown.map(r => r.id)) : new Set())} />Select all shown</label>
          {selected.size > 0 && <div className="ml-auto flex items-center gap-2" role="group" aria-label="Bulk actions"><span className="text-muted">{selected.size} selected</span><Button size="sm" onClick={() => bulk('pause')}><Pause size={13} />Pause</Button><Button size="sm" onClick={() => bulk('resume')}><Play size={13} />Resume</Button><label className="flex items-center gap-1"><span className="sr-only">Change status of selected</span><select aria-label="Change status of selected" className="h-8 rounded-control border border-control bg-surface px-2" value="" onChange={e => { const v = e.target.value; if (!v) return; Promise.all([...selected].map(jobId => setStatusFor.mutateAsync({ jobId, status: v }))).catch(() => {}); setSelected(new Set()); }}><option value="">Change status…</option>{applicationStatuses.map(([id, label]: string[]) => <option key={id} value={id}>{label}</option>)}</select></label><Button size="sm" variant="danger" onClick={() => setConfirmCancel(true)}>Cancel runs</Button><Button size="sm" variant="danger" onClick={() => { setRemoveNote({}); setRemoveOpen(true); }}>Remove…</Button></div>}
        </div>
        {q.isLoading ? <SkeletonRows rows={6} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : shown.length === 0 ? <EmptyState title={rows.length ? 'No applications match' : 'No applications yet'} description={rows.length ? 'Clear the filters to see everything.' : 'Prepare a role from Discover and it will appear here.'} action={rows.length ? <Button size="sm" onClick={() => { setSearch(''); setStatus(''); }}>Clear filters</Button> : <Button asChild size="sm" variant="primary"><Link to="/discover">Go to Discover</Link></Button>} /> : (
          <ul className="job-card-grid" aria-label="Applications">{shown.map(r => {const pres=applicationPresentationModel(q.data?.tasks||[],r.id,r.status);return (
            <li key={r.id} className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 transition-colors hover:border-brand/40">
              <div className="mb-4 flex items-start justify-between gap-3"><CompanyLogo company={r.job.company} logoUrl={r.job.logoUrl} jobId={r.job.id} /><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" aria-label={`Select ${r.job.company} ${r.job.role}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></div>
              <p className="text-sm text-muted">{r.job.company}</p>
              <h2 className="mt-1 text-base font-semibold leading-snug"><Link className="hover:text-brand hover:underline" to={`/applications/${r.id}`}>{r.job.role}</Link></h2>
              <p className="mt-2 text-sm text-muted">{r.job.location || 'Location not listed'}</p>
              <div className="my-4 flex flex-wrap gap-2"><Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>{r.match != null && <Badge tone={matchTone(r.match)}>{r.match}% match</Badge>}</div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand"><Activity size={16}/>{pres.current.title}</p><p className="mb-3 text-xs text-muted">{pres.current.message}</p><p className="mb-4 text-sm text-muted"><span className="font-medium text-ink">Next: </span>{r.next}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4"><span className="text-xs text-muted">{relTime(r.lastActivity) || 'No recent activity'}</span><span className="flex items-center gap-2"><label><span className="sr-only">Status of {r.job.company} {r.job.role}</span><select aria-label={`Status of ${r.job.company} ${r.job.role}`} className="h-8 max-w-[150px] rounded-control border border-control bg-surface px-1 text-[12px]" value={applicationStatuses.some(([id]: string[]) => id === r.status) ? r.status : ''} onChange={e => e.target.value && setStatusFor.mutate({ jobId: r.id, status: e.target.value })}>{!applicationStatuses.some(([id]: string[]) => id === r.status) && <option value="">{statusLabel(r.status)}</option>}{applicationStatuses.map(([id, label]: string[]) => <option key={id} value={id}>{label}</option>)}</select></label><Button asChild size="sm"><Link to={`/applications/${r.id}`}>Open workspace</Link></Button></span></div>
            </li>);})}</ul>)}
      </div>

      <Modal open={removeOpen} onOpenChange={o => { setRemoveOpen(o); if (!o) setRemoveNote({}); }} title={`Remove ${selected.size} application${selected.size === 1 ? '' : 's'}?`} description="This deletes the application records and their runs from Daymark. A backup of everything is saved first."
        footer={<><Button onClick={() => setRemoveOpen(false)}>{removeNote.done ? 'Close' : 'Cancel'}</Button>{!removeNote.done && <Button variant="danger" disabled={busy || selected.size === 0} onClick={() => removeSelected(Boolean(removeNote.needsSubmitted))}>{removeNote.needsSubmitted ? 'Remove submitted ones too' : 'Remove'}</Button>}</>}>
        <div className="space-y-3">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-brand)]" checked={alsoJobs} onChange={e => setAlsoJobs(e.target.checked)} /><span>Also remove the job postings from Discover<span className="block text-muted">Leave this off to keep the roles so you can apply again later.</span></span></label>
          <p className="text-muted">Documents already saved on disk (resumes, proof screenshots) are not deleted.</p>
          {removeNote.error && <p role="alert" className="text-danger">{removeNote.error}</p>}
          {removeNote.done && <p role="status" className="text-success">{removeNote.done}</p>}
        </div>
      </Modal>
      <ConfirmDialog open={confirmCancel} onOpenChange={setConfirmCancel} danger title={`Cancel ${selected.size} application${selected.size === 1 ? '' : 's'}?`} description="Cancelled runs stop immediately. Anything already submitted is unaffected." confirmLabel="Cancel runs" onConfirm={() => bulk('cancel')} />
      <Modal open={nameOpen} onOpenChange={setNameOpen} title="Save this view" description="Saves the current search and status filter in this browser." footer={<><Button onClick={() => setNameOpen(false)}>Cancel</Button><Button variant="primary" disabled={!viewName.trim()} onClick={() => { setViews(v => [...v, { name: viewName.trim(), status, search }]); setViewName(''); setNameOpen(false); }}>Save</Button></>}>
        <label className="block"><span className="mb-1 block text-[12px] font-medium">View name</span><Input autoFocus value={viewName} onChange={e => setViewName(e.target.value)} /></label>
      </Modal>
      {views.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">Saved views:{views.map(v => <button key={v.name} type="button" className="inline-flex items-center gap-1 hover:text-danger" aria-label={`Remove saved view ${v.name}`} onClick={() => setViews(vs => vs.filter(x => x.name !== v.name))}>{v.name}<X size={12} /></button>)}</div>}
    </>
  );
}
