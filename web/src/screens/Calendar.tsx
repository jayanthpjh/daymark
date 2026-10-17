import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Plus, Video } from 'lucide-react';
import { api } from '@/api/client';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';
import { cn } from '@/lib/cn';
import { eventsOn, rangeAround, rsvpLabel, sameDay, type CalEvent } from '@/lib/tracker-model';

type ViewKind = 'month' | 'week' | 'agenda';
interface CalendarData { events: CalEvent[]; conflicts: [string, string][] }
const time = (e: CalEvent) => (e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
const KINDS = ['Interview', 'Screening', 'Assessment', 'Follow-up', 'Other'] as const;

function AddEvent({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ summary: '', start: '', end: '', kind: 'Follow-up', url: '' });
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setError('');
    try {
      await api('/api/calendar/events', { ...form, start: form.start && new Date(form.start).toISOString(), end: form.end ? new Date(form.end).toISOString() : undefined });
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the event.'); }
  };
  return (
    <Modal open onOpenChange={o => !o && onClose()} title="Add an event" description="Follow-ups, calls you arranged yourself, or deadlines."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!form.summary.trim() || !form.start} onClick={save}>Save event</Button></>}>
      <div className="space-y-3">
        <label className="block"><span className="mb-1 block font-medium">Title</span><Input value={form.summary} onChange={set('summary')} maxLength={200} /></label>
        <label className="block"><span className="mb-1 block font-medium">Starts</span><Input type="datetime-local" value={form.start} onChange={set('start')} /></label>
        <label className="block"><span className="mb-1 block font-medium">Ends (optional)</span><Input type="datetime-local" value={form.end} onChange={set('end')} /></label>
        <label className="block"><span className="mb-1 block font-medium">Kind</span>
          <select className="h-10 w-full rounded-control border border-control bg-surface px-2" value={form.kind} onChange={set('kind')}>{KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
        <label className="block"><span className="mb-1 block font-medium">Meeting link (optional, https)</span><Input value={form.url} onChange={set('url')} /></label>
        {error && <p role="alert" className="text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function Detail({ event, onClose, onChanged }: { event: CalEvent; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const rsvp = async (response: 'accept' | 'decline' | 'tentative') => {
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/calendar/events/${event.id}/rsvp`, { response }); setMessage('Reply saved as a draft. Nothing was sent. Open Mail to review and send it.'); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare the reply.'); }
    finally { setBusy(false); }
  };
  const remove = async () => { await api(`/api/calendar/events/${event.id}/delete`, {}); onChanged(); onClose(); };
  const cancelled = event.status === 'CANCELLED';
  return (
    <Modal side open onOpenChange={o => !o && onClose()} title={event.summary}
      description={`${event.company ? event.company + ' · ' : ''}${new Date(event.start).toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: event.allDay ? undefined : 'numeric', minute: event.allDay ? undefined : '2-digit' })}`}
      footer={<Button variant="ghost" onClick={remove}>{event.source === 'manual' ? 'Delete' : 'Hide'}</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Badge>{event.kind}</Badge><Badge tone={cancelled ? 'danger' : event.rsvp?.sent ? 'success' : 'warning'}>{rsvpLabel(event)}</Badge></div>
        {event.url && <a href={event.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 text-brand hover:underline"><Video size={15} aria-hidden />Join link<ExternalLink size={12} aria-hidden /></a>}
        {event.location && !event.url && <p className="text-muted">{event.location}</p>}
        {event.description && <p className="whitespace-pre-wrap text-muted">{event.description}</p>}
        {event.jobId && <Link className="text-brand hover:underline" to={`/applications/${event.jobId}`}>Open the application</Link>}
        {event.source === 'mail' && !cancelled && (
          <section aria-labelledby="rsvp-h">
            <h3 id="rsvp-h" className="mb-1 font-semibold">Reply to the organizer</h3>
            <p className="mb-2 text-muted">This creates a draft. You review and send it from Mail.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy} onClick={() => rsvp('accept')}>Accept</Button>
              <Button disabled={busy} onClick={() => rsvp('tentative')}>Maybe</Button>
              <Button disabled={busy} onClick={() => rsvp('decline')}>Decline</Button>
            </div>
          </section>)}
        {message && <p role="status" className="text-success">{message} <Link className="underline" to="/mail">Open Mail</Link></p>}
        {error && <p role="alert" className="text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

export function Calendar() {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewKind>('agenda');
  const [cursor, setCursor] = useState(new Date());
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [adding, setAdding] = useState(false);
  const range = useMemo(() => rangeAround(cursor), [cursor]);
  const q = useQuery<CalendarData>({ queryKey: ['calendar', range.from], queryFn: () => api(`/api/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`), refetchInterval: 30000, retry: false });
  const reminders = useQuery<{ events: CalEvent[] }>({ queryKey: ['calendar-upcoming'], queryFn: () => api('/api/calendar/upcoming?hours=24'), refetchInterval: 60000, retry: false });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['calendar'] }); qc.invalidateQueries({ queryKey: ['calendar-upcoming'] }); };
  const events = q.data?.events ?? [];
  const conflicted = useMemo(() => new Set((q.data?.conflicts ?? []).flat()), [q.data]);
  const shift = (n: number) => setCursor(c => { const d = new Date(c); if (view === 'month') d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + n * 7); return d; });
  const days = useMemo(() => {
    if (view === 'week') { const s = new Date(cursor); s.setDate(s.getDate() - s.getDay()); return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; }); }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); first.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  }, [view, cursor]);
  const upcoming = events.filter(e => Date.parse(e.end || e.start) >= Date.now() - 3600000);
  const chip = (e: CalEvent) => (
    <button key={e.id} type="button" onClick={() => setOpen(e)} className={cn('block w-full truncate rounded px-1.5 py-0.5 text-left text-[11.5px]', e.status === 'CANCELLED' ? 'bg-muted-surface text-faint line-through' : e.kind === 'Interview' ? 'bg-brand-soft text-brand' : 'bg-muted-surface text-ink')}>
      {conflicted.has(e.id) && <span className="sr-only">Conflict. </span>}{time(e)} {e.summary}
    </button>);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <PageHeader title="Calendar" description="Interviews and screenings from your mail, plus events you add." actions={<Button onClick={() => setAdding(true)}><Plus size={15} aria-hidden />Add event</Button>} />
      {(reminders.data?.events.length ?? 0) > 0 && (
        <div role="status" className="mb-3 rounded-control bg-brand-soft p-3 text-brand">
          <span className="font-medium">Coming up in the next 24 hours: </span>
          {reminders.data!.events.map(e => `${e.summary} at ${new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`).join(' · ')}
        </div>)}
      {(q.data?.conflicts.length ?? 0) > 0 && <div role="alert" className="mb-3 flex items-center gap-2 rounded-control bg-warning-soft p-3 text-warning"><AlertTriangle size={15} aria-hidden />{q.data!.conflicts.length} overlapping {q.data!.conflicts.length === 1 ? 'meeting' : 'meetings'}. Check the marked events.</div>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Calendar view" className="flex rounded-control bg-muted-surface p-1">{(['agenda', 'week', 'month'] as ViewKind[]).map(v => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn('h-8 rounded px-3 capitalize', view === v ? 'bg-surface font-medium shadow-sm' : 'text-muted')}>{v}</button>)}</div>
        {view !== 'agenda' && <><Button size="icon" variant="secondary" aria-label="Previous" onClick={() => shift(-1)}><ChevronLeft size={16} /></Button><Button size="icon" variant="secondary" aria-label="Next" onClick={() => shift(1)}><ChevronRight size={16} /></Button><span className="font-medium">{cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span></>}
      </div>
      <Card>
        {q.isLoading ? <SkeletonRows /> : view === 'agenda' ? (upcoming.length === 0 ? <EmptyState title="Nothing scheduled" description="Invitations in your mail appear here after the next mail sync. You can also add an event yourself." /> : (
          <ul className="divide-y divide-line">{upcoming.map(e => (
            <li key={e.id}><button type="button" onClick={() => setOpen(e)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-muted-surface">
              <span><span className={cn('block font-medium', e.status === 'CANCELLED' && 'line-through')}>{e.summary}</span><span className="block text-muted">{new Date(e.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {time(e)}{e.company ? ` · ${e.company}` : ''}</span></span>
              <span className="flex shrink-0 items-center gap-1.5">{conflicted.has(e.id) && <Badge tone="warning">Overlaps</Badge>}<Badge>{e.kind}</Badge><Badge tone={e.status === 'CANCELLED' ? 'danger' : e.rsvp?.sent ? 'success' : 'neutral'}>{rsvpLabel(e)}</Badge></span>
            </button></li>))}</ul>)
        ) : (
          <div className="overflow-x-auto"><div className="grid min-w-[560px] grid-cols-7">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="border-b border-line px-2 py-1.5 text-[12px] font-medium text-muted">{d}</div>)}
            {days.map(d => <div key={d.toISOString()} className={cn('border-b border-r border-line p-1.5', view === 'month' ? 'min-h-24' : 'min-h-64', d.getMonth() !== cursor.getMonth() && view === 'month' && 'bg-bg text-faint')}>
              <div className={cn('mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px]', sameDay(d, new Date()) && 'bg-brand text-on-brand')}>{d.getDate()}</div>
              <div className="space-y-1">{eventsOn(events, d).map(chip)}</div></div>)}
          </div></div>)}
      </Card>
      {open && <Detail event={open} onClose={() => setOpen(null)} onChanged={refresh} />}
      {adding && <AddEvent onClose={() => setAdding(false)} onSaved={refresh} />}
    </>
  );
}
