import { useDaymarkState } from '@/api/client';
import { setupReadiness } from '@/lib/ui-model';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/primitives';
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
          <Card><CardHeader title="Profile" /><dl className="grid gap-4 p-4 sm:grid-cols-2">{[['Name', p.name], ['Email', p.email], ['Phone', p.phone], ['Target role', p.roleSearch], ['Location', p.location]].map(([k, v]) => <div key={String(k)}><dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{k}</dt><dd>{v || '—'}</dd></div>)}</dl></Card>
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
