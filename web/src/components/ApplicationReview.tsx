import { useEffect, useState } from 'react';
import { api, useApiMutation } from '@/api/client';
import { reviewAnswers, reviewToken } from '@/lib/submission-review';
import { Badge, Button, Card, CardHeader, EmptyState } from './ui/primitives';

export function ApplicationReview({fill,prepare,company,onActivity}:{fill:any;prepare:any;company:string;onActivity:()=>void}) {
  const [edits,setEdits]=useState<Record<string,any>>({});
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState('');
  const rows=reviewAnswers(fill);
  const groupFor=(row:any)=>/gender|hispanic|race|veteran|disability|ethnicity/i.test(row.label)?'Voluntary disclosures':/experience|employment/i.test(row.step)&&!/application information/i.test(row.step)?'Work experience':/education/i.test(row.step)?'Education':/^(first name|last name|email|country|phone|location|address|city|state|postal|linkedin)/i.test(row.label)?'Personal information':'Application questions';
  const groups=Array.from(new Set(rows.map(groupFor)));

  const ready=fill?.status==='needs_you'&&fill.finalReviewReady&&!fill.submitAttemptedAt;
  useEffect(()=>{setEdits({});setConfirmed(false);},[fill?.checkpoint?.id,fill?.finalReviewReady,prepare?.review?.approvedAt]);
  const save=useApiMutation(async()=>api(`/api/tasks/${fill.id}/answers`,{checkpointId:fill.checkpoint.id,answers:edits}));
  const submit=useApiMutation(async()=>{
    const snapshot=await reviewToken(fill,prepare);
    const latest=await api('/api/state');
    const liveFill=latest.tasks.find((t:any)=>t.id===fill.id),livePrepare=latest.tasks.find((t:any)=>t.id===prepare.id);
    if(!liveFill?.finalReviewReady||liveFill.status!=='needs_you'||await reviewToken(liveFill,livePrepare)!==snapshot)throw new Error('This application changed. Review the latest answers before submitting.');
    if(prepare.review?.approvalStatus!=='approved')return api(`/api/tasks/${prepare.id}/review`,{resumeText:prepare.review.resume,confirmedAccurate:true,submitAfter:true,expectedReview:snapshot});
    return api('/api/tasks/submit',{taskId:fill.id,confirmed:true,expectedReview:snapshot});
  });
  const cancel=useApiMutation(()=>api(`/api/tasks/${fill.id}/cancel`,{}));
  const busy=save.isPending||submit.isPending||cancel.isPending;
  const run=async(action:'save'|'submit')=>{setError('');try{await (action==='save'?save:submit).mutateAsync(undefined);setEdits({});setConfirmed(false);onActivity();}catch(e){setError((e as Error).message);setConfirmed(false);}};
  return <div className={ready?'grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]':'space-y-4'}>
    {ready&&<aside className="space-y-4 lg:sticky lg:top-4"><div><h2 className="text-lg font-semibold">Review before submit</h2><p className="mt-1 text-sm text-muted">Waiting for your approval</p></div><p className="text-sm text-muted">Check what we filled in for {company}, and edit supported answers before we submit.</p><p className="rounded-control bg-muted-surface p-3 text-xs text-muted">Some employer controls are read only here. Saved profile details and attached documents remain visible for review.</p></aside>}
    <div className="min-w-0 space-y-4"><Card>
      {rows.length?<>{groups.map(group=><section key={group} aria-label={group}><CardHeader title={group} action={<span className="text-xs text-muted">{rows.filter(row=>groupFor(row)===group).length} fields</span>} /><div className="grid gap-4 p-4">{rows.filter(row=>groupFor(row)===group).map((row:any)=>{ const i=rows.indexOf(row);
        const editable=ready&&row.editable&&(row.type!=='custom'||row.options?.length>0);
        const value=row.id in edits?edits[row.id]:row.value;
        const change=(v:any)=>{setEdits(current=>({...current,[row.id]:v}));setConfirmed(false);};
        const inputClass='mt-2 min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm';
        return <div key={row.key||i} className="min-w-0"><label htmlFor={`review-${i}`} className="block text-xs font-semibold uppercase tracking-wide">{row.label.replace(/\*$/,'')}{row.required&&<span className="ml-1 text-xs text-muted">Required</span>}</label>
          {editable?(row.options?.length?<select id={`review-${i}`} disabled={busy} className={inputClass} multiple={Array.isArray(value)||row.type==='checkbox'} value={value??''} onChange={e=>change(e.target.multiple?Array.from(e.target.selectedOptions,o=>o.value):e.target.value)}>{!row.required&&<option value="">No selection</option>}{row.options.map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:row.type==='textarea'?<textarea id={`review-${i}`} disabled={busy} className={inputClass} rows={4} maxLength={row.maxLength||undefined} value={value??''} onChange={e=>change(e.target.value)} />:<input id={`review-${i}`} disabled={busy} className={inputClass} type={['email','tel','number','date','url'].includes(row.type)?row.type:'text'} maxLength={row.maxLength||undefined} value={value??''} onChange={e=>change(e.target.value)} />):<p id={`review-${i}`} className="mt-2 whitespace-pre-wrap break-words">{Array.isArray(value)?value.join(', ')||'No answer selected':String(value??row.answer??'')||'No answer entered'}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted"><span>{row.step}</span>{row.source&&<Badge>{row.source==='ai'?'Drafted from resume':row.source}</Badge>}{!editable&&<span>Read only</span>}</div></div>;
      })}</div></section>)}</>:<EmptyState title="No saved answers yet" description="Verified application answers will appear here." />}
    </Card>
    {ready&&prepare?.review&&<Card><CardHeader title="Attached resume" action={<Badge tone={prepare.review.approvalStatus==='approved'?'success':'warning'}>{prepare.review.approvalStatus==='approved'?'Reviewed':'Review before submitting'}</Badge>} /><details className="p-4"><summary className="cursor-pointer font-medium text-brand">Read your resume</summary><pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm">{prepare.review.resume}</pre></details>{prepare.review.coverLetter&&<details className="border-t border-line p-4"><summary className="cursor-pointer font-medium text-brand">Read your cover letter</summary><p className="mt-4 whitespace-pre-wrap">{prepare.review.coverLetter}</p></details>}</Card>}
    {ready&&<Card className="sticky bottom-0 z-10 p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4">{Object.keys(edits).length?<><p className="max-w-xl text-sm text-muted">Save your changes first. Daymark will update and verify the employer form, then bring it back for review.</p><Button variant="primary" disabled={busy} onClick={()=>void run('save')}>{save.isPending?'Saving…':'Save changes and verify'}</Button></>:<><label className="flex max-w-xl items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} /><span>I reviewed the answers and resume and want to submit this application to {company}.</span></label><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={async()=>{setError('');try{await cancel.mutateAsync(undefined);onActivity();}catch(e){setError((e as Error).message);}}}>Cancel application</Button><Button variant="primary" disabled={!confirmed||busy||!rows.length} onClick={()=>void run('submit')}>{submit.isPending?'Submitting…':`Submit to ${company}`}</Button></div></>}</div>{error&&<p role="alert" className="mt-3 text-sm text-danger">{error}</p>}</Card>}
  </div></div>;
}
