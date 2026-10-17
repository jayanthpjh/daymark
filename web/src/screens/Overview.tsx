import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDaymarkState } from '@/api/client';
import { applicationRows, needsYou } from '@/lib/derive';
import { streamModel } from '@/lib/stream-model';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CalEvent } from '@/lib/tracker-model';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, Stat } from '@/components/ui/primitives';
import { relTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const badgeTone = { DONE: 'success', RUNNING: 'info', ACTION: 'warning', SKIPPED: 'neutral' } as const;

export function Overview() {
  // The next 24 hours from the real calendar (invites in your mail, events you added). Empty if mail storage is not connected.
  const agenda = useQuery<{ events: CalEvent[] }>({ queryKey: ['calendar-upcoming'], queryFn: () => api('/api/calendar/upcoming?hours=24'), refetchInterval: 60000, retry: false });
  const today = agenda.data?.events ?? [];
  const q = useDaymarkState();
  const m = useMemo(() => {
    if (!q.data) return null;
    const rows = applicationRows(q.data);
    const applied = rows.filter(r => ['submitted', 'screening', 'interview', 'offer'].includes(r.status)).length;
    const responded = rows.filter(r => ['screening', 'interview', 'offer', 'rejected'].includes(r.status)).length;
    return { rows, applied, interviews: rows.filter(r => r.status === 'interview').length, rate: (() => { const sent = applied + rows.filter(r => r.status === 'rejected').length; return sent ? Math.round(100 * responded / sent) : null; })(), needs: needsYou(q.data), stream: streamModel(q.data) };
  }, [q.data]);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!m) return <><PageHeader title="Overview" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <Card key={i} className="p-4"><Skeleton className="h-3 w-20" /><Skeleton className="mt-3 h-7 w-12" /></Card>)}</div><Card className="mt-4"><SkeletonRows /></Card></>;

  return (
    <>
      <PageHeader title="Your next opportunity starts here." description="Your applications, next steps, and progress — all in one place." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Applied" value={m.applied} hint="confirmed submissions" />
        <Stat label="Waiting on you" value={m.needs.length} hint={m.needs.length ? 'open the list below' : 'all clear'} />
        <Stat label="Interviews" value={m.interviews} hint="recorded stage" />
        <Stat label="Response rate" value={m.rate == null ? '—' : `${m.rate}%`} hint="needs mail sync for full data" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Application activity" action={<Badge tone={m.stream.active ? 'info' : 'neutral'}>{m.stream.active ? 'Active' : 'Idle'}</Badge>} />
            <ol className="grid grid-cols-3 gap-2 border-b border-line p-3 xl:grid-cols-6" aria-label="Pipeline stages">
              {m.stream.stages.map((s: any) => (
                <li key={s.id} className={cn('rounded-control border px-2 py-2', s.status === 'active' ? 'border-info bg-info-soft' : s.status === 'waiting' ? 'border-warning bg-warning-soft' : 'border-line')}>
                  <div className="text-[12px] font-medium">{s.label}</div><div className="text-[11.5px] text-muted">{s.sub}</div>
                </li>
              ))}
            </ol>
            {m.stream.events.length === 0 ? <EmptyState title="No activity yet" description="Prepare an application from Discover and follow its progress here." /> : (
              <ul className="divide-y divide-line">{m.stream.events.map((e: any) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Badge tone={badgeTone[e.badge as keyof typeof badgeTone] ?? 'neutral'} className="mt-0.5 w-[72px] justify-center">{e.badge}</Badge>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{e.title}</div>{e.detail && <div className="truncate text-[12px] text-muted">{e.detail}</div>}</div>
                  <span className="shrink-0 text-[11.5px] text-faint">{relTime(e.at)}</span>
                </li>))}</ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Your next steps" action={m.needs.length > 0 ? <Badge tone="warning">{m.needs.length}</Badge> : undefined} />
            {m.needs.length === 0 ? <EmptyState title="You’re all caught up" description="Questions and reviews will appear here when an application needs your input." /> : (
              <ul className="divide-y divide-line">{m.needs.slice(0, 8).map(n => (
                <li key={n.id}><Link to={n.href} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-muted-surface"><div className="min-w-0 flex-1"><div className="truncate font-medium">{n.title}</div><div className="truncate text-[12px] text-muted">{n.detail}</div></div><ArrowRight size={14} className="text-faint" aria-hidden /></Link></li>))}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Next 24 hours" />
            {today.length === 0 ? <EmptyState title="Nothing in the next 24 hours" /> : <ul className="divide-y divide-line">{today.map(e => <li key={e.id} className="px-4 py-2.5"><div className="font-medium">{e.summary}</div><div className="text-[12px] text-muted">{e.kind} · {new Date(e.start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div></li>)}</ul>}
            <div className="border-t border-line px-4 py-2"><Link to="/calendar" className="text-brand hover:underline">Open calendar</Link></div>
          </Card>
        </div>
      </div>
    </>
  );
}
