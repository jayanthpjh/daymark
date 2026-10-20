import { api, useDaymarkState } from '@/api/client';
import { useEffect, useMemo, useState } from 'react';
import { ROLE_FAMILIES, suggestRoleFamilies } from '../../../job-sources/role-families.mjs';
import { setupReadiness } from '@/lib/ui-model';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui/overlays';
import { CheckCircle2, Circle } from 'lucide-react';

export function Materials() {
  const q = useDaymarkState();
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <><PageHeader title="Materials" /><Card><SkeletonRows /></Card></>;
  const d = q.data;
  const p = d.profile || {};
  const values = Object.entries(d.answerPack?.values || {}).filter(([, v]) => v != null && String(v) !== '');
  const learned = Object.entries(d.answers || {});
  const readiness = setupReadiness(d, d.integrations || {});
  return (
    <>
      <PageHeader title="Materials" description="What Daymark uses to fill and tailor applications." />
      <TabsRoot defaultValue="profile">
        <TabsList aria-label="Materials sections">{[['profile', 'Profile'], ['resumes', 'Resume variants'], ['pack', 'Answer pack'], ['learned', 'Learned answers'], ['templates', 'Templates']].map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList>
        <TabsContent value="profile"><div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title="Profile" /><dl className="grid gap-4 p-4 sm:grid-cols-2">{[['Name', p.name], ['Email', p.email], ['Phone', p.phone], ['Location', p.location]].map(([k, v]) => <div key={String(k)}><dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{k}</dt><dd>{v || '—'}</dd></div>)}</dl><RoleTargetsEditor roleSearch={p.roleSearch || ''} roleFamilies={p.roleFamilies || []} /></Card>
          <Card><CardHeader title="Setup" action={<Badge tone={readiness.ready ? 'success' : 'warning'}>{readiness.ready ? 'Ready' : 'Incomplete'}</Badge>} /><ul className="divide-y divide-line">{readiness.requirements.map(r => <li key={String(r.id)} className="flex items-center gap-2 px-4 py-2.5">{r.complete ? <CheckCircle2 size={15} className="text-success" aria-hidden /> : <Circle size={15} className="text-faint" aria-hidden />}<span className={r.complete ? '' : 'font-medium'}>{r.label}</span><span className="sr-only">{r.complete ? 'complete' : 'incomplete'}</span></li>)}</ul></Card>
        </div></TabsContent>
        <TabsContent value="resumes"><Card><CardHeader title="Master resume" /><iframe title="Master resume preview" sandbox="" src="/api/profile/template" className="h-[560px] w-full border-0 md:h-[740px]" /><div className="border-t border-line p-3 text-muted">Named variants (backend, data, startup…) arrive with resume tailoring in Phase 4.</div></Card></TabsContent>
        <TabsContent value="pack"><Card><CardHeader title="Answer pack" action={<Badge tone={d.answerPack?.completed ? 'success' : 'warning'}>{d.answerPack?.completed ? 'Completed' : 'Incomplete'}</Badge>} />{values.length === 0 ? <EmptyState title="No saved answers" description="Answers you save from Questions appear here." /> : <dl className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2">{values.map(([k, v]) => <div key={k}><dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{k.replaceAll('_', ' ')}</dt><dd className="break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>)}</dl>}</Card></TabsContent>
        <TabsContent value="learned"><Card><CardHeader title="Learned answers" />{learned.length === 0 ? <EmptyState title="Nothing learned yet" description="Answers remembered from Questions are listed here so you can review or remove them." /> : <ul className="divide-y divide-line">{learned.slice(0, 100).map(([k, v]: any) => <li key={k} className="px-4 py-2.5"><div className="font-medium">{v?.label || k}</div><div className="text-muted">{typeof v === 'object' ? String(v?.value ?? v?.answer ?? '') : String(v)}</div></li>)}</ul>}</Card></TabsContent>
        <TabsContent value="templates"><Card><EmptyState title="No templates yet" description="Reply and outreach templates arrive with the mail client." /></Card></TabsContent>
      </TabsRoot>
    </>
  );
}

function RoleTargetsEditor({ roleSearch: savedTitles, roleFamilies: savedFamilies }: { roleSearch: string; roleFamilies: string[] }) {
  const q = useDaymarkState();
  const [titles, setTitles] = useState(savedTitles);
  const [selected, setSelected] = useState<string[]>(savedFamilies);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { setTitles(savedTitles); setSelected(savedFamilies); }, [savedTitles, savedFamilies]);
  const suggestions = useMemo(() => suggestRoleFamilies(titles), [titles]);
  const families = ROLE_FAMILIES.filter(family => family.label.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (id: string) => setSelected(items => items.includes(id) ? items.filter(value => value !== id) : [...items, id]);
  async function save() {
    setBusy(true); setMessage('');
    try { await api('/api/profile/role-targets', { roleSearch: titles, roleFamilies: selected }); await q.refetch(); setMessage('Target roles saved. Collection will use these reviewed selections.'); }
    catch (error) { setMessage(`Could not save targets: ${(error as Error).message}`); }
    finally { setBusy(false); }
  }
  return <section className="border-t border-line p-4" aria-labelledby="role-targets-title">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 id="role-targets-title" className="font-semibold">Role targets</h3><p className="mt-1 text-sm text-muted">Your title searches stay active. Select families to broaden collection; suggestions never apply until you choose and save them.</p></div><Badge>{selected.length} selected</Badge></div>
    <label className="mt-4 block text-sm font-medium" htmlFor="role-title-targets">Titles and custom searches</label>
    <textarea id="role-title-targets" className="mt-1 min-h-20 w-full rounded-control border border-control bg-surface p-3 text-sm" value={titles} onChange={event => setTitles(event.target.value)} placeholder="Data Engineer, Analytics Architect" />
    <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-sm font-medium">Suggested from titles:</span>{suggestions.length ? suggestions.map(id => { const family = ROLE_FAMILIES.find(item => item.id === id)!; return <button key={id} type="button" aria-pressed={selected.includes(id)} onClick={() => toggle(id)} className={`rounded-full border px-3 py-1 text-xs font-medium ${selected.includes(id) ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:text-ink'}`}>{family.label}</button>; }) : <span className="text-sm text-muted">No family suggestions yet.</span>}<Button size="sm" variant="secondary" disabled={!suggestions.length} onClick={() => setSelected(items => [...new Set([...items, ...suggestions])])}>Add suggestions</Button></div>
    <label className="mt-4 block text-sm font-medium" htmlFor="role-family-search">Browse role families</label>
    <Input id="role-family-search" className="mt-1" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search 22 role families…" />
    <div className="mt-2 grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto rounded-control border border-line p-2 sm:grid-cols-2" role="group" aria-label="Role families">{families.map(family => <label key={family.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted-surface"><input type="checkbox" checked={selected.includes(family.id)} onChange={() => toggle(family.id)} /><span>{family.label}</span></label>)}</div>
    <div className="mt-3 flex flex-wrap items-center gap-3"><Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save role targets'}</Button><span role="status" aria-live="polite" className="text-sm text-muted">{message}</span></div>
  </section>;
}
