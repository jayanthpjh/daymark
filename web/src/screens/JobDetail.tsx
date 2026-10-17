import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { CompanyLogo } from '@/components/CompanyLogo';
import { MatchRing } from '@/components/MatchRing';
import { api, useApiMutation, useDaymarkState } from '@/api/client';
import { facetsOf, placeOf } from '@/lib/job-facets';
import { jobStatus } from '@/lib/ui-model';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { relTime } from '@/lib/format';

const Pill = ({ children }: { children: React.ReactNode }) => <span className="rounded-full border border-line bg-surface px-3 py-1 text-[13px]">{children}</span>;
const Fact = ({ label, value }: { label: string; value: React.ReactNode }) => <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0"><dt className="text-[13px] text-muted">{label}</dt><dd className="text-right text-[13.5px] font-medium">{value || 'Not listed'}</dd></div>;

export function JobDetail() {
  const { jobId = '' } = useParams();
  const nav = useNavigate();
  const q = useDaymarkState();
  const [note, setNote] = useState('');
  const prepare = useApiMutation(() => api('/api/tasks', { jobId, resumeMode: 'tailored' }));
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <><Skeleton className="mb-4 h-7 w-64" /><Card><div className="h-64" /></Card></>;
  const job: any = q.data.jobs.find(j => j.id === jobId);
  if (!job) return <EmptyState title="Job not found" description="It may have been removed." action={<Button asChild size="sm"><Link to="/discover">Back to jobs</Link></Button>} />;
  const f = facetsOf(job);
  const started = jobStatus(job, q.data.tasks, q.data.applications) !== 'not_started';
  const where = placeOf(job);
  const paragraphs = String(job.description || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const check = async () => { setNote('Checking…'); try { const r = await api(`/api/jobs/${encodeURIComponent(job.id)}/check-open`, {}); setNote(r.status === 'open' ? 'Still open on the employer site.' : 'The employer site did not confirm either way.'); } catch (e) { setNote((e as Error).message); } q.refetch(); };

  return (
    <article className="mx-auto max-w-6xl">
      <Button variant="secondary" size="sm" className="rounded-full" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/discover'))}><ArrowLeft size={14} aria-hidden />Back to jobs</Button>
      <header className="mt-6">
        <p className="flex items-center gap-2 text-muted"><CompanyLogo company={job.company} logoUrl={job.logoUrl} jobId={job.id} /><span>{job.company}</span></p>
        <h1 className="mt-3 text-[34px] font-medium leading-tight tracking-tight">{job.role} at {job.company}{where ? ` in ${where}` : ''}</h1>
        <div className="mt-4 flex flex-wrap gap-2">{[f.level, f.workplace, f.type, where].filter(Boolean).map(t => <Pill key={t}>{t}</Pill>)}{f.sponsors && <Pill>Sponsors visa</Pill>}{job.closedAt && <Badge tone="danger">Closed by the employer</Badge>}</div>
      </header>

      <div className="mt-8 grid gap-8 border-t border-line pt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {f.skills.length > 0 && <section aria-labelledby="skills-h" className="mb-8"><h2 id="skills-h" className="mb-3 text-xl font-medium">Skills</h2><ul className="flex flex-wrap gap-2">{f.skills.map(s => <li key={s} className="rounded-full bg-muted-surface px-3 py-1 text-[13px]">{s}</li>)}</ul></section>}
          <section aria-labelledby="desc-h"><h2 id="desc-h" className="mb-3 text-xl font-medium">Job Description</h2>
            {paragraphs.length ? <div className="space-y-4 leading-relaxed">{paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div> : <p className="text-muted">The employer's listing had no description. Open the posting to read it.</p>}
          </section>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Apply and details">
          <Card className="p-5">
            <h2 className="text-lg font-medium">Interested in this role?</h2>
            <p className="mt-1 text-[13px] text-muted">Daymark tailors your resume and fills the application. You review it before anything is sent.</p>
            {job.match != null && <p className="mt-3 flex items-center gap-2 text-[13px] text-muted"><MatchRing value={job.match} />{job.matchReason || 'Match with your resume'}</p>}
            {started ? <Button asChild variant="primary" className="mt-4 w-full rounded-full"><Link to={`/applications/${job.id}`}>View application<ArrowRight size={15} aria-hidden /></Link></Button>
              : <Button variant="primary" className="mt-4 w-full rounded-full" disabled={prepare.isPending || Boolean(job.closedAt)} onClick={() => prepare.mutate(undefined, { onSuccess: () => nav(`/applications/${job.id}`) })}>{prepare.isPending ? 'Preparing…' : 'Prepare application'}<ArrowRight size={15} aria-hidden /></Button>}
            {prepare.isError && <p role="alert" className="mt-2 text-[13px] text-danger">{(prepare.error as Error).message}</p>}
            <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
              {job.url && <a className="inline-flex items-center gap-1 text-brand hover:underline" href={job.url} target="_blank" rel="noreferrer noopener">Employer posting<ExternalLink size={12} aria-hidden /></a>}
              {!started && !job.closedAt && String(job.id).startsWith('ats-') && <button type="button" className="text-muted underline" onClick={check}>Check still open</button>}
            </div>
            {note && <p role="status" className="mt-2 text-[12.5px] text-muted">{note}</p>}
          </Card>
          <Card className="px-5 py-2"><dl>
            <Fact label="Location" value={where} />
            <Fact label="Salary" value={job.salary} />
            <Fact label="Experience" value={job.yearsExperience ? `${job.yearsExperience}+ years` : f.level} />
            <Fact label="Workplace" value={f.workplace} />
            <Fact label="Posted" value={job.posted ? relTime(job.posted) : ''} />
            <Fact label="Confirmed open" value={job.last_seen_at && job.last_seen_at !== job.first_seen_at ? relTime(job.last_seen_at) : ''} />
            <Fact label="Source" value={job.source} />
          </dl></Card>
        </aside>
      </div>
    </article>
  );
}
