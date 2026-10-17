import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';
import { relTime } from '@/lib/format';
import { pct, stageTone, type GroupStat, type TimelineItem, type TrackerRow, type TrackerView } from '@/lib/tracker-model';

const hint = (row: TrackerRow) => (row.stage === 'ghosted' ? `${row.quietDays} days quiet` : row.flags.includes('unconfirmed') ? 'Submit not confirmed' : row.nextEvent ? `Next: ${new Date(row.nextEvent).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : row.lastActivityAt ? relTime(row.lastActivityAt) : '');

function RateTable({ title, data }: { title: string; data: Record<string, GroupStat> }) {
  const rows = Object.entries(data);
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? <EmptyState title="Not enough data" description="Rates appear after applications are submitted." /> : (
        <table className="w-full text-left text-[13px]">
          <thead className="text-muted"><tr><th scope="col" className="px-4 py-2 font-medium">Group</th><th scope="col" className="px-2 py-2 font-medium">Sent</th><th scope="col" className="px-2 py-2 font-medium">Replied</th><th scope="col" className="px-4 py-2 font-medium">Interviews</th></tr></thead>
          <tbody className="divide-y divide-line">{rows.map(([k, v]) => (
            <tr key={k}><th scope="row" className="px-4 py-2 font-medium capitalize">{k || 'unknown'}</th><td className="px-2 py-2">{v.n}</td><td className="px-2 py-2">{pct(v.replyRate)}{v.lowSample && <span className="ml-1 text-faint"> (few)</span>}</td><td className="px-4 py-2">{pct(v.interviewRate)}{v.lowSample && <span className="ml-1 text-faint"> (few)</span>}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

function Detail({ row, onClose }: { row: TrackerRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const timeline = useQuery<{ timeline: TimelineItem[] }>({ queryKey: ['tracker-timeline', row.jobId], queryFn: () => api(`/api/tracker/${encodeURIComponent(row.jobId)}/timeline`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['tracker'] }); qc.invalidateQueries({ queryKey: ['tracker-timeline', row.jobId] }); };
  const act = async (path: string, body: unknown) => { setError(''); try { await api(path, body); refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } };
  return (
    <Modal side open onOpenChange={o => !o && onClose()} title={row.company} description={`${row.role} · ${row.stage}`}
      footer={<Button asChild><Link to={`/applications/${row.jobId}`}>Open application</Link></Button>}>
      <div className="space-y-4">
        {row.stage === 'ghosted' && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-control bg-muted-surface p-3">
            <span>{row.flags.includes('automatic') ? `No reply in ${row.quietDays} days, so this shows as Ghosted.` : 'You marked this as Ghosted.'}</span>
            <Button variant="secondary" onClick={() => act(`/api/tracker/${encodeURIComponent(row.jobId)}/ghost`, { action: 'undo' })}>Undo</Button>
          </div>
        )}
        {row.stage === 'applied' && <Button variant="secondary" onClick={() => act(`/api/tracker/${encodeURIComponent(row.jobId)}/ghost`, { action: 'mark' })}>Mark as ghosted</Button>}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <section aria-labelledby="notes-h">
          <h3 id="notes-h" className="mb-1 font-semibold">Add a note</h3>
          <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} aria-label="Note" placeholder="Who you emailed, what they said" />
          <Button className="mt-2" variant="secondary" disabled={!note.trim()} onClick={async () => { await act(`/api/tracker/${encodeURIComponent(row.jobId)}/note`, { text: note }); setNote(''); }}>Save note</Button>
        </section>
        <section aria-labelledby="tl-h">
          <h3 id="tl-h" className="mb-1 font-semibold">Timeline</h3>
          {timeline.isLoading ? <SkeletonRows rows={3} /> : (timeline.data?.timeline.length ?? 0) === 0 ? <p className="text-muted">Nothing recorded yet.</p> : (
            <ol className="space-y-2">{timeline.data!.timeline.map((item, i) => (
              <li key={`${item.at}-${i}`} className="flex items-start justify-between gap-3">
                <span><Badge>{item.kind}</Badge> <span className={item.cancelled ? 'line-through' : ''}>{item.text}</span></span>
                <span className="shrink-0 text-faint">{relTime(item.at)}</span>
                {item.kind === 'note' && item.id && <Button variant="ghost" size="sm" aria-label="Delete note" onClick={() => act(`/api/tracker/${encodeURIComponent(row.jobId)}/note`, { delete: item.id })}>Delete</Button>}
              </li>))}</ol>
          )}
        </section>
      </div>
    </Modal>
  );
}

export function Tracker() {
  const q = useQuery<TrackerView>({ queryKey: ['tracker'], queryFn: () => api('/api/tracker'), refetchInterval: 8000 });
  const [open, setOpen] = useState<TrackerRow | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const view = q.data;
  const max = Math.max(1, ...(view?.funnel.weekly.map(w => w.submitted) ?? [1]));
  return (
    <>
      <PageHeader title="Tracker" description="Every application by stage, from what Daymark recorded: statuses, mail and your calendar." />
      {q.isLoading || !view ? <Card><SkeletonRows /></Card> : view.rows.length === 0 ? <Card><EmptyState title="Nothing to track yet" description="Applications appear here as soon as you prepare one." /></Card> : (
        <>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            <div className="flex min-w-max gap-3">{view.stages.map(s => (
              <section key={s.id} aria-label={s.label} className="w-60 shrink-0 rounded-card bg-muted-surface p-2">
                <h2 className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-semibold">{s.label}<Badge>{s.count}</Badge></h2>
                <ul className="space-y-2">{view.rows.filter(r => r.stage === s.id).map(r => (
                  <li key={r.jobId}>
                    <button type="button" onClick={() => setOpen(r)} className="block w-full rounded-control border border-line bg-surface p-2.5 text-left hover:border-line-strong">
                      <span className="block truncate font-medium">{r.company}</span>
                      <span className="block truncate text-muted">{r.role}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-[12px] text-faint"><Badge tone={stageTone(r.stage)}>{s.label}</Badge>{hint(r)}</span>
                    </button>
                  </li>))}</ul>
              </section>))}</div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Weekly applications" />
              {view.funnel.weekly.length === 0 ? <EmptyState title="No submissions yet" /> : (
                <table className="w-full text-left text-[13px]">
                  <thead className="text-muted"><tr><th scope="col" className="px-4 py-2 font-medium">Week of</th><th scope="col" className="px-2 py-2 font-medium">Sent</th><th scope="col" className="px-2 py-2 font-medium">Replied</th><th scope="col" className="px-4 py-2 font-medium">Interviews</th></tr></thead>
                  <tbody className="divide-y divide-line">{view.funnel.weekly.map(w => (
                    <tr key={w.week}><th scope="row" className="px-4 py-2 font-medium">{w.week}</th><td className="px-2 py-2"><span className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-2 rounded bg-brand" style={{ width: `${Math.max(6, (w.submitted / max) * 80)}px` }} />{w.submitted}</span></td><td className="px-2 py-2">{w.replied}</td><td className="px-4 py-2">{w.interviewed}</td></tr>))}</tbody>
                </table>
              )}
            </Card>
            <RateTable title="Replies by ATS" data={view.funnel.byAts} />
            <RateTable title="Replies by source" data={view.funnel.bySource} />
            <RateTable title="Replies by tailoring mode" data={view.funnel.byTailoring} />
            <RateTable title="Replies by resume" data={view.funnel.byResume} />
          </div>
        </>)}
      {open && <Detail row={open} onClose={() => setOpen(null)} />}
    </>
  );
}
