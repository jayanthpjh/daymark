import { useDaymarkState } from '@/api/client';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { protonBridgeStatus } from '@/lib/ui-model';
import { Link } from 'react-router-dom';

const later = [['LLM models and speed', 'Model routing and latency arrive with Phase 1.'], ['Backups and disk', 'Backup history and disk use arrive with Phase 0.'], ['Tailscale', 'Remote access status arrives with Phase 2.'], ['AI routing', 'Per-task model routing arrives with Phase 1.']];

export function System() {
  const q = useDaymarkState();
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <><PageHeader title="System" /><Card><SkeletonRows /></Card></>;
  const d = q.data;
  const proton = protonBridgeStatus(d);
  const t = d.tasks || [];
  const count = (s: string) => t.filter(x => x.status === s).length;
  const rows: [string, React.ReactNode][] = [
    ['Worker', <Badge key="w" tone={d.worker?.status === 'ready' ? 'success' : 'warning'}>{d.worker?.status || 'unknown'}</Badge>],
    ['Worker mode', d.worker?.mode || '—'], ['State store', d.agentRuntime?.stateStore || '—'], ['Task queue', d.agentRuntime?.taskQueue || '—'],
    ['Queued / running / needs you', `${count('queued')} / ${count('running')} / ${count('needs_you')}`],
    ['Mail forwarding', d.mailForwarding?.enabled ? `On (${d.mailForwarding.sent} sent, ${d.mailForwarding.failed} failed)` : 'Off'],
  ];
  return (
    <>
      <PageHeader title="System" description="Runtime health of the worker, queue and integrations." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Runtime" /><dl className="divide-y divide-line">{rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl></Card>
        <Card><CardHeader title="Integrations" /><dl className="divide-y divide-line">{Object.entries(d.integrations || {}).map(([k, v]) => <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5"><dt className="capitalize text-muted">{k === 'proton' ? 'Proton Bridge' : k}</dt><dd>{k === 'proton' ? <Badge tone={proton.tone}>{proton.label}</Badge> : <Badge tone={v ? 'success' : 'warning'}>{v ? 'configured' : 'missing'}</Badge>}</dd></div>)}{Object.keys(d.integrations || {}).length === 0 && <EmptyState title="No integration data" />}</dl></Card>
        <Card><CardHeader title="Proton Bridge" action={<Badge tone={proton.tone}>{proton.label}</Badge>} /><p className="px-4 pb-3 text-sm text-muted">{proton.description}</p><div className="border-t border-line px-4 py-3"><Link className="text-sm font-medium text-brand underline" to="/mail">Open Mail</Link></div></Card>
        {later.map(([title, text]) => <Card key={title}><CardHeader title={title} action={<Badge>Planned</Badge>} /><EmptyState title="Not available yet" description={text} /></Card>)}
      </div>
    </>
  );
}
