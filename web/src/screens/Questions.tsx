import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { api, ApiError, useApiMutation, useDaymarkState } from '@/api/client';
import { answerItems, buildQuestionInbox, buildApplicationQuestionInbox, canDraft, defaultSave, isAnswered } from '@/lib/questions-model';
import { Sparkles } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

export function Questions({ jobId, embedded = false }: { jobId?: string; embedded?: boolean } = {}) {
  const q = useDaymarkState();
  // Drafts live in local state keyed by question group, so background polling never overwrites typing.
  const [drafts, setDrafts] = useState<Record<string, string | string[]>>({});
  const [saves, setSaves] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<number | null>(null);
  const inbox = useMemo(() => q.data ? (jobId ? buildApplicationQuestionInbox(q.data.tasks, q.data.jobs, jobId) : buildQuestionInbox(q.data.tasks, q.data.jobs)) : null, [q.data, jobId]);
  const send = useApiMutation((items: any[]) => api('/api/questions/answer', { items }));
  const items = inbox ? answerItems(inbox.groups, drafts, saves) : [];
  const setDraft = (k: string, v: string | string[]) => setDrafts(d => ({ ...d, [k]: v }));
  const [drafting, setDrafting] = useState<Record<string, boolean>>({});
  const [draftNote, setDraftNote] = useState<Record<string, string>>({});
  const draftOne = async (g: any) => {
    setDrafting(d => ({ ...d, [g.key]: true })); setDraftNote(n => ({ ...n, [g.key]: '' }));
    try {
      const body = { questions: [{ id: g.items[0].questionId, label: g.label, maxLength: g.maxLength, taskId: g.items[0].taskId }] };
      const r: any = await api('/api/questions/draft', body);
      const text = r.drafts?.[g.items[0].questionId];
      if (text) setDraft(g.key, text); else setDraftNote(n => ({ ...n, [g.key]: r.skipped?.[0]?.reason || 'No draft was written. Answer it yourself.' }));
    } catch (e: any) { setDraftNote(n => ({ ...n, [g.key]: e.message || 'The draft could not be written.' })); }
    finally { setDrafting(d => ({ ...d, [g.key]: false })); }
  };

  const submit = () => send.mutate(items, { onSuccess: () => { setDone(items.length); setDrafts({}); } });

  return (
    <>
      {!embedded && <PageHeader title="Questions" description="Employer questions Daymark could not answer from your profile. Review the application context before reusing an answer." />}
      {q.isLoading ? <Card><SkeletonRows rows={4} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : !inbox || (inbox.groups.length === 0 && inbox.employerPage.length === 0) ? (
        <Card><EmptyState icon={<CheckCircle2 size={28} />} title="No questions waiting" description="When an application needs an answer, it shows up here and in the top bar." /></Card>
      ) : (
        <div className="space-y-3 pb-24">
          {done != null && <div role="status" className="rounded-card border border-success/30 bg-success-soft p-3 text-success">Sent {done} answer{done === 1 ? '' : 's'}. The applications are resuming.</div>}
          {inbox.groups.map(g => {
            const value = drafts[g.key] ?? '';
            const isDecision = g.meta.lane === 'decision';
            const saveOn = saves[g.key] ?? defaultSave(g);
            return (
              <Card key={g.key} className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone={isDecision ? 'warning' : g.meta.kind === 'eeo' ? 'info' : 'brand'}>{g.meta.title}</Badge>
                  {g.required && <Badge tone="neutral">Required</Badge>}
                  <span className="text-[12px] text-muted">{g.items.length === 1 ? `${g.items[0].company} · ${g.items[0].role}` : `${g.items.length} applications: ${[...new Set(g.items.map(i => i.company))].join(', ')}`}</span>
                  {isAnswered(value) && <CheckCircle2 size={15} className="ml-auto text-success" aria-label="Answered" />}
                </div>
                <h2 id={`q-${g.key}`} className="mb-1 text-[14.5px] font-semibold">{g.label}</h2>
                <p className="mb-3 text-[12px] text-muted">{g.meta.note}</p>
                {g.items.some(i => i.error) && <p role="alert" className="mb-2 text-danger">{g.items.find(i => i.error)?.error}</p>}
                {g.options.length > 0 && g.type !== 'multiselect' ? (
                  <div role="radiogroup" aria-labelledby={`q-${g.key}`} className="flex flex-wrap gap-2">
                    {g.options.map(o => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => setDraft(g.key, o.value)} className={cn('min-h-10 rounded-control border px-3 text-[13px]', value === o.value ? 'border-brand bg-brand-soft font-medium text-brand' : 'border-line-strong bg-surface hover:bg-muted-surface')}>{o.label}</button>)}
                  </div>
                ) : g.type === 'textarea' ? (
                  <div>
                    <Textarea aria-labelledby={`q-${g.key}`} value={String(value)} maxLength={g.maxLength || undefined} onChange={e => setDraft(g.key, e.target.value)} />
                    {canDraft(g) && <div className="mt-2 flex flex-wrap items-center gap-3"><Button size="sm" variant="secondary" disabled={drafting[g.key]} onClick={() => draftOne(g)}><Sparkles size={13} aria-hidden />{drafting[g.key] ? 'Drafting…' : 'Draft with model'}</Button><span className="text-[12px] text-muted">Written from your approved resume. Edit it before you send.</span></div>}
                    {draftNote[g.key] && <p role="status" className="mt-2 text-[12.5px] text-warning">{draftNote[g.key]}</p>}
                  </div>
                ) : (
                  <Input aria-labelledby={`q-${g.key}`} value={String(value)} onChange={e => setDraft(g.key, e.target.value)} />
                )}
                {!isDecision && <label className="mt-3 flex items-center gap-2 text-[12.5px] text-muted"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={saveOn} onChange={e => setSaves(s => ({ ...s, [g.key]: e.target.checked }))} />Remember for matching questions ({g.meta.saveTarget})</label>}
              </Card>
            );
          })}
          {inbox.employerPage.length > 0 && (
            <Card><div className="border-b border-line px-4 py-3"><h2 className="text-[15px] font-semibold">Needs the employer page</h2><p className="text-muted">These controls cannot be answered here. Complete them on the employer site.</p></div>
              <ul className="divide-y divide-line">{inbox.employerPage.map(e => <li key={e.taskId + e.questionId} className="flex items-center gap-3 px-4 py-2.5"><div className="min-w-0 flex-1"><div className="truncate font-medium">{e.label}</div><div className="text-[12px] text-muted">{e.company} · {e.role}</div></div><ExternalLink size={14} className="text-faint" aria-hidden /></li>)}</ul></Card>
          )}
        </div>
      )}
      {inbox && inbox.groups.length > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <span className="text-muted" aria-live="polite">{items.length === 0 ? `${inbox.counts.questions} question${inbox.counts.questions === 1 ? '' : 's'} open` : `${items.length} answer${items.length === 1 ? '' : 's'} ready across ${new Set(items.map(i => i.taskId)).size} application${new Set(items.map(i => i.taskId)).size === 1 ? '' : 's'}`}</span>
          <div className="flex items-center gap-2">{send.isError && <span role="alert" className="text-danger">{(send.error as ApiError).message}</span>}<Button variant="primary" disabled={items.length === 0 || send.isPending} onClick={submit}>{send.isPending ? 'Sending…' : `Send ${items.length} answer${items.length === 1 ? '' : 's'}`}</Button></div>
        </div>
      )}
    </>
  );
}
