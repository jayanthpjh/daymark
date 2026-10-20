import { recoveryAction } from '@/lib/submission-review';
import { ApplicationProcessing } from '@/components/ApplicationProcessing';
import { ApplicationReview } from '@/components/ApplicationReview';
import { CompanyLogo } from '@/components/CompanyLogo';
import { buildApplicationQuestionInbox } from '@/lib/questions-model';
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import { api, useApiMutation, useDaymarkState } from '@/api/client';
import { applicationStatuses, applicationPresentationModel, applicationRun } from '@/lib/application-model';
import { statusLabel, statusTone } from '@/lib/derive';
import { jobStatus } from '@/lib/ui-model';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/ui/primitives';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui/overlays';
import { Mail } from './Mail';
import { dateTime, relTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Questions } from './Questions';
import { CoverLetterReview, PrepSheet, ResumeReview } from './TailoringReview';

const tabs = ['live', 'form', 'resume', 'cover', 'job', 'mail', 'timeline', 'prep'] as const;
const tabLabel: Record<string, string> = { live: 'Activity', form: 'Questions & answers', resume: 'Resume', cover: 'Cover letter', job: 'Job details', mail: 'Mail', timeline: 'Timeline', prep: 'Interview prep' };
const stageTone = { complete: 'success', active: 'info', waiting: 'warning', failed: 'danger', idle: 'neutral' } as const;

export function Workspace() {
  const { jobId = '' } = useParams();
  const q = useDaymarkState();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('section');
  const setTab = (value: string) => setParams(current => { const next = new URLSearchParams(current); next.set('section', value); return next; });
  const act = useApiMutation(({ id, a, body }: { id: string; a: string; body?: Record<string, unknown> }) => api(`/api/tasks/${id}/${a}`, body ?? {}));
  const m = useMemo(() => {
    if (!q.data) return null;
    const job = q.data.jobs.find(j => j.id === jobId);
    if (!job) return { job: null } as any;
    const status = jobStatus(job, q.data.tasks, q.data.applications);
    return { job, run: applicationRun(q.data.tasks, jobId), pres: applicationPresentationModel(q.data.tasks, jobId, status), status };
  }, [q.data, jobId]);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!m) return <><Skeleton className="mb-4 h-7 w-64" /><Card><SkeletonRows /></Card></>;
  if (!m.job) return <EmptyState title="Application not found" description="It may have been removed." action={<Button asChild size="sm"><Link to="/applications">Back to applications</Link></Button>} />;
  const { job, run, pres, status } = m;
  const fill = run.fill;
  const scopedInbox = buildApplicationQuestionInbox(q.data!.tasks, q.data!.jobs, jobId);
  const questionBlock = !fill?.finalReviewReady && (scopedInbox.groups.length > 0 || ['answers_needed', 'legal_review_required'].includes(fill?.reviewState?.kind || ''));
  const manualBlock = fill?.status === 'needs_you' && !questionBlock && !fill?.finalReviewReady;
  const primary = fill?.finalReviewReady ? 'Review and send' : questionBlock ? 'Answer questions' : manualBlock ? recoveryAction(fill).label : run.prepare?.hasArtifacts && !run.approved ? 'Review resume' : null;
  const tab = tabs.includes(requestedTab as typeof tabs[number]) ? requestedTab! : questionBlock || fill?.finalReviewReady ? 'form' : 'live';

  return (
    <div className="application-workbench"><div className="workspace-layout min-w-0 gap-6">
      <aside className="application-rail min-w-0" aria-label="Application queue">
        <div className="sticky top-0">
          <Link to="/applications" className="mb-4 inline-flex items-center gap-2 font-medium"><ArrowLeft size={14} />All applications</Link>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your applications</p>
          <nav className="space-y-1" aria-label="Switch application">{q.data!.jobs.filter(j => q.data!.tasks.some(t => t.jobId === j.id)).slice(0, 30).map(j => <Link key={j.id} to={`/applications/${j.id}`} aria-current={j.id === jobId ? 'page' : undefined} className={cn('block rounded-control border p-3', j.id === jobId ? 'border-brand bg-brand-soft' : 'border-transparent hover:bg-muted-surface')}><span className="block font-medium">{j.company}</span><span className="mt-1 block text-xs text-muted">{j.role}</span></Link>)}</nav>
        </div>
      </aside>
      <div className="min-w-0">
      <Link to="/applications" className="mb-3 inline-flex items-center gap-1 text-muted hover:text-ink"><ArrowLeft size={14} />Applications</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><CompanyLogo company={job.company} logoUrl={job.logoUrl} jobId={job.id} /><div className="min-w-0"><h1 className="truncate text-[22px] font-[650] tracking-tight">{job.company}</h1><p className="truncate text-muted">{job.role}{job.location ? ` · ${job.location}` : ''}</p></div></div>
        <span className="flex items-center gap-2"><Badge tone={statusTone(status)} className="text-[12.5px]">{statusLabel(status)}</Badge><label><span className="sr-only">Change status</span><select aria-label="Change status" className="h-9 rounded-control border border-control bg-surface px-2" value="" onChange={async e => { const v = e.target.value; if (!v) return; try { await api(`/api/applications/${encodeURIComponent(jobId)}/status`, { status: v }); q.refetch(); } catch { /* the status list refreshes on the next poll */ } }}><option value="">Change status…</option>{applicationStatuses.map(([id, label]: string[]) => <option key={id} value={id}>{label}</option>)}</select></label></span>
      </div>

      {!fill?.finalReviewReady && <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><div className="text-[12px] font-medium text-muted">Next action</div><div className="text-[15px] font-semibold">{pres.current.title}</div><p className="max-w-xl text-muted">{questionBlock ? `${scopedInbox.counts.questions} questions need your input. Answers apply to this application.` : pres.current.message}</p></div>
          <div className="flex gap-2">
            {primary ? <Button variant="primary" onClick={() => setTab(manualBlock ? recoveryAction(fill).section : primary === 'Review resume' ? 'resume' : 'form')}>{primary}</Button> : null}
            {fill && ['queued', 'running'].includes(fill.status) && <Button onClick={() => act.mutate({ id: fill.id, a: 'pause' })}>Pause</Button>}
            {fill && ['paused', 'failed'].includes(fill.status) && <Button onClick={() => act.mutate({ id: fill.id, a: 'resume' })}>{fill.status === 'failed' ? 'Retry' : 'Resume'}</Button>}
          </div>
        </div>
        <ol className="application-stages mt-4 grid grid-cols-2 gap-2" aria-label="Application stages">
          {pres.stages.map((s: any) => <li key={s.id} className="rounded-control border border-line p-2"><div className="flex items-center justify-between gap-1"><span className="text-[12.5px] font-medium">{s.label}</span><Badge tone={stageTone[s.status as keyof typeof stageTone]}>{s.status}</Badge></div><div className="mt-1 text-[11.5px] text-muted">{s.detail}</div></li>)}
        </ol>
        {act.isError && <p role="alert" className="mt-2 text-danger">{(act.error as Error).message}</p>}
      </Card>}

      <TabsRoot value={tab} onValueChange={setTab}>
        <TabsList aria-label="Application sections">{tabs.map(t => <TabsTrigger key={t} value={t}>{tabLabel[t]}</TabsTrigger>)}</TabsList>
        <TabsContent value="live"><ApplicationProcessing job={job} prepare={run.prepare} fill={fill} pres={pres} /></TabsContent>

        <TabsContent value="form">{manualBlock && <Card className="mb-4 p-4"><h2 className="text-lg font-semibold">{fill.submitAttemptedAt?'Submission needs confirmation':'Application needs attention'}</h2><p className="mt-2 text-sm text-muted">{fill.submitAttemptedAt?'The employer has not confirmed receipt. Daymark will not submit again. Check application mail for a receipt or verification request.':pres.current.message}</p>{!fill.submitAttemptedAt&&<div className="mt-3 flex flex-wrap gap-2"><Button variant="primary" disabled={act.isPending} onClick={()=>act.mutate({id:fill.id,a:'handoff',body:{showBrowser:true}})}>Resolve this step</Button><Button disabled={act.isPending} onClick={()=>act.mutate({id:fill.id,a:'handoff/resume'})}>Continue processing</Button></div>}{!fill.submitAttemptedAt&&<p className="mt-2 text-xs text-muted">Resolve this step opens the employer page in Chrome so you can finish it yourself (a security check, a code, a login). Then choose Continue processing and Daymark picks up where you stopped.</p>}{act.isError&&<p role="alert" className="mt-2 text-sm text-danger">{(act.error as Error).message}</p>}</Card>}{questionBlock && <Questions key={jobId} jobId={jobId} embedded />}<ApplicationReview key={jobId} fill={fill} prepare={run.prepare} company={job.company} onActivity={() => setTab('live')} /></TabsContent>

        <TabsContent value="resume">{run.prepare?.hasArtifacts ? <ResumeReview key={run.prepare.id} prepare={run.prepare} /> : <Card><EmptyState title="Resume not ready" description="The tailored resume appears here for review before anything is attached." /></Card>}</TabsContent>
        <TabsContent value="cover"><CoverLetterReview prepare={run.prepare} /></TabsContent>
        <TabsContent value="job"><Card><CardHeader title="Job details" action={job.url && <a className="inline-flex items-center gap-1 text-brand hover:underline" href={job.url} target="_blank" rel="noreferrer">Posting<ExternalLink size={13} /></a>} />
          <dl className="grid gap-4 p-4 sm:grid-cols-3">{[['Location', job.location], ['Salary', job.salary], ['Match', job.match != null ? `${job.match}%` : ''], ['Source', job.source], ['Posted', job.posted ? dateTime(job.posted) : '']].map(([k, v]) => <div key={String(k)}><dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
          {job.description && <div className="whitespace-pre-wrap border-t border-line p-4 text-muted">{String(job.description).slice(0, 4000)}</div>}
        </Card></TabsContent>
        <TabsContent value="mail"><Mail jobId={jobId} embedded /></TabsContent>
        <TabsContent value="timeline"><Card><CardHeader title="Timeline" />
          {run.current?.diagnostics?.timeline?.length ? <ul className="divide-y divide-line">{run.current.diagnostics.timeline.map((t: any) => <li key={t.revision} className="flex justify-between gap-3 px-4 py-2.5"><span className="font-medium">{String(t.state).replaceAll('_', ' ')} <span className="text-muted">· {t.worker}</span></span><span className="text-[12px] text-faint">{dateTime(t.at)}</span></li>)}</ul> : <EmptyState title="No timeline yet" />}
        </Card></TabsContent>
        <TabsContent value="prep"><PrepSheet prepare={run.prepare} /></TabsContent>
      </TabsRoot>
      </div>
    </div></div>
  );
}
