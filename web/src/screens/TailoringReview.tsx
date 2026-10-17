import { useMemo, useState } from 'react';
import { Check, Eye, RotateCcw, Sparkles, TriangleAlert, Undo2 } from 'lucide-react';
import { api, useApiMutation } from '@/api/client';
import { Badge, Button, Card, CardHeader, EmptyState } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { MODES, applyStrikes, inventedCount, kindLabel, kindTone, type Change, type Claim, type KeywordScore, type Mode, type Version } from '@/lib/tailoring';

const modeLabel = (_mode?: string) => 'Interview-focused';

function Score({ score }: { score: KeywordScore | null }) {
  if (!score) return null;
  const gain = score.after - score.before;
  return (
    <div className="border-b border-line p-4" aria-label="Keyword match">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[12px] font-medium uppercase tracking-wide text-muted">Keyword match with the posting</div>
        <div className="text-[18px] font-semibold tabular-nums">{score.before}% <span className="text-faint">→</span> {score.after}%{gain > 0 && <span className="ml-2 text-[12px] font-medium text-success">+{gain}</span>}</div>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted-surface" role="img" aria-label={`Match rose from ${score.before} to ${score.after} percent`}>
        <div className="absolute inset-y-0 left-0 bg-line-strong" style={{ width: `${score.before}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand/80 transition-all" style={{ width: `${score.after}%`, opacity: 0.55 }} />
        <div className="absolute inset-y-0 left-0 border-r-2 border-surface" style={{ width: `${score.before}%` }} />
      </div>
      {!!score.missing?.length && <p className="mt-2 text-[12px] text-muted">Still missing: {score.missing.slice(0, 8).map(term => <span key={term} className="mr-1 rounded bg-muted-surface px-1.5 py-0.5 font-mono text-[11px]">{term}</span>)}</p>}
    </div>
  );
}

function ModePicker({onPick,busy}:{mode:Mode;onPick:(m:Mode)=>void;busy:boolean;current:Mode}) { return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><div><h3 className="flex items-center gap-2 font-semibold"><Sparkles size={18}/>Interview-focused tailoring</h3><p className="text-sm text-muted">Prove the posting’s qualifications with what you used, how, why, and where.</p></div><Button disabled={busy} onClick={()=>onPick('strong')}><Sparkles size={15}/>Tailor for this role</Button></div>; }

function ChangeRow({ change, index, struck, onToggle }: { change: Change; index: number; struck: boolean; onToggle: (i: number) => void }) {
  const removable = change.kind !== 'source';
  const label = change.kind === 'invented' ? 'Remove' : 'Use original';
  return (
    <li className={cn('p-4', struck && 'bg-muted-surface/60')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[13px]">{change.section}</strong>
        <div className="flex items-center gap-2">
          <Badge tone={kindTone(change.kind)}>{kindLabel[change.kind]}</Badge>
          {removable && <Button size="sm" variant={struck ? 'secondary' : 'ghost'} onClick={() => onToggle(index)} aria-pressed={struck}>{struck ? <><Undo2 size={13} />Restore</> : label}</Button>}
        </div>
      </div>
      <div className={cn('grid gap-3', change.before ? 'md:grid-cols-2' : '')}>
        {change.before && <div className="rounded-control border border-line p-2.5"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{change.kind === 'invented' ? 'Closest in your resume' : 'Your resume'}</div><p className="whitespace-pre-wrap">{change.before}</p></div>}
        <div className={cn('rounded-control p-2.5', change.kind === 'invented' ? 'bg-warning-soft' : 'bg-info-soft', struck && 'opacity-60')}>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Tailored</div>
          <p className={cn('whitespace-pre-wrap', struck && 'line-through decoration-ink/40')}>{change.after}</p>
        </div>
      </div>
      {change.kind === 'invented' && !!change.novel?.length && <p className="mt-2 text-[12px] text-muted">New to your resume: {change.novel.map(term => <span key={term} className="mr-1 rounded bg-muted-surface px-1.5 py-0.5 font-mono text-[11px]">{term}</span>)}</p>}
      {change.reason && <p className="mt-1.5 text-[12px] text-muted">{change.reason}</p>}
    </li>
  );
}

export function ResumeReview({ prepare }: { prepare: any }) {
  const review = prepare?.review;
  const current: Version = { mode: review?.tailoringMode || 'honest', resume: review?.resume || '', coverLetter: review?.coverLetter || '', changes: review?.changes || [], claims: review?.claims || [], prep: review?.prep || [], keywordScore: review?.keywordScore || null, note: review?.tailoringNote };
  const [picked, setPicked] = useState<Mode>(current.mode);
  const [preview, setPreview] = useState<Version | null>(null);
  const [struck, setStruck] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const shown = preview || current;
  const previewing = Boolean(preview);

  const gen = useApiMutation(async (mode: Mode) => api<{ preview: any }>(`/api/tasks/${prepare.id}/tailor-preview`, { mode }));
  const approve = useApiMutation(async (resumeText: string) => api(`/api/tasks/${prepare.id}/review`, { resumeText, confirmedAccurate: true }));

  const changes = useMemo(() => shown.changes.filter(c => c.kind !== 'source' || c.before !== c.after), [shown]);
  const finalText = useMemo(() => applyStrikes(shown.resume, shown.changes, struck), [shown, struck]);
  const remaining = inventedCount(shown.changes, struck);
  const approved = review?.approvalStatus === 'approved' && !previewing;

  const pick = async (mode: Mode) => {
    setPicked(mode); setError(''); setStruck(new Set()); setConfirmed(false);
    if (mode === current.mode) { setPreview(null); return; }
    try { const r = await gen.mutateAsync(mode); setPreview({ ...r.preview, mode }); }
    catch (e: any) { setPreview(null); setPicked(current.mode); setError(e.message || 'The model could not tailor this resume.'); }
  };
  const toggle = (i: number) => setStruck(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; });
  const submit = async () => { setError(''); try { await approve.mutateAsync(finalText); setPreview(null); setStruck(new Set()); setConfirmed(false); } catch (e: any) { setError(e.message || 'Could not approve the resume.'); } };

  return (
    <Card>
      <CardHeader title="Tailored resume" action={<div className="flex items-center gap-2">{approved ? <Badge tone="success"><Check size={12} />Approved</Badge> : <Badge tone="warning">Needs your review</Badge>}<a className="text-brand hover:underline" href={`/api/tasks/${prepare.id}/files/resume.pdf`}>PDF</a></div>} />
      <ModePicker mode={picked} onPick={pick} busy={gen.isPending || approve.isPending} current={current.mode} />
      {gen.isPending && <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-muted" role="status"><Sparkles size={15} className="animate-pulse" aria-hidden />Writing a {modeLabel(picked).toLowerCase()} version. This takes up to a minute.</div>}
      {(shown.note || shown.fellBack) && <p className="border-b border-line bg-warning-soft px-4 py-2.5 text-[12.5px] text-warning" role="status">{shown.note || 'The model was unavailable, so your original wording was kept.'}</p>}
      <Score score={shown.keywordScore} />
      {previewing && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-info-soft px-4 py-2.5 text-info"><span className="inline-flex items-center gap-2 text-[13px] font-medium"><Eye size={14} aria-hidden />Previewing {modeLabel(preview!.mode)}. Nothing is saved or attached yet.</span><Button size="sm" variant="ghost" onClick={() => pick(current.mode)}><RotateCcw size={13} />Back to {modeLabel(current.mode)}</Button></div>}
      {changes.length === 0 ? <EmptyState title="No tailoring changes" description="This version matches your master resume." />
        : <ul className="divide-y divide-line" aria-label="Changes">{shown.changes.map((c, i) => (c.kind !== 'source' || c.before !== c.after) ? <ChangeRow key={i} change={c} index={i} struck={struck.has(i)} onToggle={toggle} /> : null)}</ul>}
      {!approved && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface p-4">
          <label className="flex max-w-xl items-start gap-2 text-[13px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            <span>I reviewed every change{remaining > 0 ? <> and can speak to the <strong>{remaining} invented {remaining === 1 ? 'line' : 'lines'}</strong></> : ''}.</span>
          </label>
          <div className="flex items-center gap-2">
            {struck.size > 0 && <span className="text-[12px] text-muted">{struck.size} struck</span>}
            <Button variant="primary" disabled={!confirmed || approve.isPending || gen.isPending} onClick={submit}>{approve.isPending ? 'Approving…' : previewing ? `Use ${modeLabel(preview!.mode)} version` : 'Approve resume'}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="border-t border-line bg-danger-soft px-4 py-2.5 text-[12.5px] text-danger">{error}</p>}
    </Card>
  );
}

export function CoverLetterReview({ prepare }: { prepare: any }) {
  const letter: string = prepare?.review?.coverLetter || '';
  if (!prepare?.hasArtifacts) return <Card><EmptyState title="Cover letter not ready" description="It appears here once the application is prepared." /></Card>;
  if (!letter) return <Card><EmptyState title="No cover letter for this version" description="Generate one from the Resume tab, or leave cover letters off in Automation rules." /></Card>;
  const claims: Claim[] = (prepare.review?.claims || []).filter((c: Claim) => c.section === 'Cover letter');
  return (
    <Card>
      <CardHeader title="Cover letter" action={<Badge tone="neutral">Interview-focused</Badge>} />
      <div className="whitespace-pre-wrap p-4 leading-relaxed">{letter}</div>
      {claims.length > 0 && <div className="border-t border-line p-4"><div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Lines with new figures</div><ul className="space-y-2">{claims.map(c => <li key={c.id} className="rounded-control bg-warning-soft p-2.5 text-[13px]">{c.claim}</li>)}</ul></div>}
    </Card>
  );
}

export function PrepSheet({ prepare }: { prepare: any }) {
  const prep: Claim[] = prepare?.review?.prep || [];
  const warnings: { claim: string; earlier: string; appliedTo?: string }[] = prepare?.review?.consistencyWarnings || [];
  if (!prepare?.hasArtifacts) return <Card><EmptyState title="Prep sheet not ready" description="It is built from the resume you approve." /></Card>;
  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <Card className="border-warning/40"><CardHeader title={<span className="inline-flex items-center gap-2 text-warning"><TriangleAlert size={16} aria-hidden />Conflicts with earlier applications</span>} />
          <ul className="divide-y divide-line">{warnings.map((w, i) => <li key={i} className="p-4 text-[13px]"><p><strong>Now:</strong> {w.claim}</p><p className="mt-1 text-muted"><strong>Sent before{w.appliedTo ? ` (${w.appliedTo})` : ''}:</strong> {w.earlier}</p><p className="mt-1 text-[12px] text-muted">Use the same figures with this company, or strike one of the lines.</p></li>)}</ul></Card>
      )}
      <Card>
        <CardHeader title="Interview prep" action={<Badge tone={prep.length ? 'warning' : 'success'}>{prep.length} {prep.length === 1 ? 'claim' : 'claims'} to defend</Badge>} />
        {prep.length === 0 ? <EmptyState title="Nothing to defend" description="Every line in this resume comes from your own history, so there are no invented claims to prepare." />
          : <ul className="divide-y divide-line">{prep.map(item => (
            <li key={item.id} className="p-4">
              <div className="mb-1 flex items-center gap-2"><Badge tone="warning">Invented</Badge><span className="text-[12px] text-muted">{item.section}</span></div>
              <p className="font-medium">{item.claim}</p>
              <dl className="mt-3 grid gap-3 text-[13px] md:grid-cols-2">
                <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">They may ask</dt><dd>{item.likelyQuestion}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Your talking point</dt><dd>{item.talkingPoint}</dd></div>
              </dl>
            </li>))}</ul>}
      </Card>
    </div>
  );
}
