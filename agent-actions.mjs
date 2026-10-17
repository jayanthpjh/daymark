// What the assistant can actually do. Every action calls the same code the screens call, through injected dependencies.
//   change    runs at once: only changes Daymark's own data (add a link, collect jobs, prepare documents)
//   approve   becomes a card; runs only when the applicant accepts it, and only if what the card describes is unchanged
// Not wired on purpose: consent answers, resume accuracy approval, and settings. Those stay with the applicant on their screens.
import {validateAnswers,isConsentControl} from './application-questions.mjs';

const text=(value,max=300)=>String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const label=job=>[job?.company,job?.role].filter(Boolean).join(' · ')||'this application';

export function createAgentActions({readState,importJobUrl,startCollect,queuePrepare,fillTask,submitTask,saveMailDraft,queueAnswer,reviewTokenFor}){
  const jobFor=(state,jobId)=>state.jobs.find(j=>j.id===jobId);
  const prepareFor=(state,jobId)=>state.tasks.find(t=>t.type==='prepare'&&t.jobId===jobId&&!['cancelled','failed'].includes(t.status));
  const fillFor=(state,taskId)=>{const t=state.tasks.find(x=>x.id===taskId);return t?.type==='fill'?t:state.tasks.find(x=>x.type==='fill'&&x.parentTaskId===t?.id&&!['cancelled','failed'].includes(x.status));};

  const change={
    add_job_link:async({url}={})=>{const job=await importJobUrl(text(url,2000));return {job:{id:job.id,company:job.company,role:job.role},navigation:{jobId:job.id,section:'job'}};},
    collect_jobs:async()=>({task:await startCollect()}),
    // Prepares tailored documents and stops. Filling the employer form is a separate card.
    prepare_application:async({jobId,tailoringMode}={})=>{
      const state=await readState();const job=jobFor(state,jobId);if(!job)return {status:'not_found'};
      const task=await queuePrepare(job,{tailoringMode});
      return {status:'queued',taskId:task.id,company:job.company,role:job.role,navigation:{jobId:job.id,section:'resume'}};
    },
  };

  // Each approve action has: check(args) -> {summary, binding} or {error}; verify(args) -> binding now; run(args) -> {message}.
  const approve={
    fill_application:{
      async check({jobId}={}){
        const state=await readState();const job=jobFor(state,jobId);const prep=prepareFor(state,jobId);
        if(!job)return {error:'That application was not found.'};
        if(!prep?.artifacts)return {error:'Prepare the documents for this application first.'};
        if(fillFor(state,prep.id))return {error:'This application is already being filled.'};
        return {summary:`Fill the employer form for ${label(job)}. Nothing is submitted.`,binding:`prep:${prep.id}:${prep.status}`};
      },
      async verify({jobId}){const state=await readState();const prep=prepareFor(state,jobId);return prep?`prep:${prep.id}:${prep.status}`:'gone';},
      async run({jobId}){const state=await readState();const prep=prepareFor(state,jobId);await fillTask({taskId:prep.id});return {message:'Filling started. You will review it before anything is submitted.',link:`/applications/${jobId}?section=live`};},
    },
    submit_application:{
      async check({taskId}={}){
        const state=await readState();const fill=fillFor(state,taskId);const prep=state.tasks.find(t=>t.id===fill?.parentTaskId);
        if(!fill||!prep?.artifacts)return {error:'No filled application was found.'};
        if(fill.submitAttemptedAt)return {error:'Submit was already clicked for this application.'};
        if(fill.status!=='needs_you'||!fill.finalReviewReady)return {error:'This application is not at its final review yet.'};
        if(!prep.artifacts.approved)return {error:'Approve the resume in the review first.'};
        const job=jobFor(state,fill.jobId);
        return {summary:`Submit the application for ${label(job)}. Daymark will click the employer's Submit button. This cannot be undone.`,binding:await reviewTokenFor(fill,prep)};
      },
      async verify({taskId}){const state=await readState();const fill=fillFor(state,taskId);const prep=state.tasks.find(t=>t.id===fill?.parentTaskId);return fill&&prep?`${await reviewTokenFor(fill,prep)}`:'gone';},
      async run({taskId}){const state=await readState();const fill=fillFor(state,taskId);await submitTask({taskId:fill.id,expectedReview:await reviewTokenFor(fill,state.tasks.find(t=>t.id===fill.parentTaskId))});return {message:'Queued for submission. Daymark will confirm with the employer.',link:`/applications/${fill.jobId}?section=live`};},
    },
    send_mail:{
      async check({to,subject,body}={}){
        if(!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(String(to||''))||/[\r\n]/.test(String(to)))return {error:'The recipient address is not valid.'};
        if(!text(subject)||!text(body,60000))return {error:'The email needs a subject and a message.'};
        return {summary:`Save an email to ${text(to,120)} ("${text(subject,80)}") as a draft in Mail. It is not sent until you review and send it there.`,binding:`mail:${text(to,120)}|${text(subject,120)}|${String(body).length}`};
      },
      async verify({to,subject,body}){return `mail:${text(to,120)}|${text(subject,120)}|${String(body).length}`;},
      async run({to,subject,body}){const saved=await saveMailDraft({to:String(to),subject:String(subject).slice(0,300),body:String(body).slice(0,60000),attachments:[]});return {message:'Draft saved. Review and send it from Mail.',link:`/mail?draft=${saved.draft.id}`};},
    },
    answer_question:{
      async check({questionId,value}={}){
        const state=await readState();
        for(const task of state.tasks.filter(t=>t.type==='fill'&&t.status==='needs_you'&&t.checkpoint?.questions)){
          const q=task.checkpoint.questions.find(x=>x.id===questionId);if(!q)continue;
          if(isConsentControl(q)||/consent|privacy|terms|agree|certif|signature|acknowledg/i.test(q.label))return {error:'Consent and agreement questions are answered by you on the Questions screen.'};
          const checked=validateAnswers([q],{[q.id]:value});if(Object.keys(checked.errors).length)return {error:Object.values(checked.errors)[0]};
          const job=jobFor(state,task.jobId);
          return {summary:`Answer "${text(q.label,100)}" with "${text(Array.isArray(value)?value.join(', '):value,100)}" for ${label(job)}.`,binding:`q:${task.id}:${task.checkpoint.id}:${q.id}`};
        }
        return {error:'That question is not waiting for an answer.'};
      },
      async verify({questionId}){const state=await readState();for(const task of state.tasks.filter(t=>t.type==='fill'&&t.status==='needs_you'&&t.checkpoint?.questions))if(task.checkpoint.questions.some(x=>x.id===questionId))return `q:${task.id}:${task.checkpoint.id}:${questionId}`;return 'gone';},
      async run({questionId,value}){const state=await readState();const task=state.tasks.find(t=>t.type==='fill'&&t.status==='needs_you'&&t.checkpoint?.questions?.some(x=>x.id===questionId));await queueAnswer({taskId:task.id,checkpointId:task.checkpoint.id,questionId,value});return {message:'Answer sent. Daymark is checking the employer form again.',link:`/applications/${task.jobId}?section=form`};},
    },
  };
  return {change,approve};
}
