export const applicationStatuses=[['not_started','Not applied'],['in_progress','In progress'],['filled','Filled manually · not submitted'],['submitted','Applied / submitted'],['unconfirmed','Submission unconfirmed'],['failed','Failed'],['screening','Screening'],['interview','Interview'],['offer','Offer'],['rejected','Rejected'],['withdrawn','Withdrawn'],['skipped','Skipped by your rules']];
export function normalizeApplicationStatus(value){return value==='applied'?'submitted':value==='not_applied'?'not_started':value;}
export function displayTaskMessage(value){
 const text=String(value||'').replace(/\u001b\[[0-9;]*m/g,'').replace(/\[(?:\d{1,3};)*\d{1,3}m/g,'');
 if(/browserType\.launchPersistentContext|Opening in existing browser session/i.test(text))return 'The application browser could not open because its profile was already in use. This is a recorded browser launch failure.';
 return /locator\.waitFor: Timeout/i.test(text)?'A browser control was unavailable on that screen. Continue processing to resume from the current application step.':text;
}
export function applicationRun(tasks,jobId){
 const related=tasks.filter(task=>task.jobId===jobId&&task.type!=='collect');
 const prepare=related.find(task=>task.type==='prepare'&&!['cancelled'].includes(task.status));
 const fill=prepare?related.find(task=>task.type==='fill'&&task.parentTaskId===prepare.id&&!['cancelled','failed'].includes(task.status))||related.find(task=>task.type==='fill'&&task.parentTaskId===prepare.id):null;
 const current=fill||prepare||related[0];
 const finalReady=Boolean(prepare?.hasArtifacts&&(prepare.reviewPolicy!=='final'||prepare.manualFillRequired||fill?.finalReviewReady));
 const approved=prepare?.review?.approvalStatus==='approved';
 const progress=!prepare?0:fill?Math.min(100,Math.round(45+(Number(fill.progress)||0)*.5)):prepare.hasArtifacts?45:Math.min(45,Math.round((Number(prepare.progress)||0)*.45));
 return {prepare,fill,current,finalReady,approved,progress:approved&&(fill?.finalReviewReady||prepare?.manualFillRequired)?100:progress};
}
export function runActivity(tasks,jobId){return tasks.filter(task=>task.jobId===jobId).flatMap(task=>task.activity?.length?task.activity.map(item=>({...item,type:task.type})):[{type:task.type,status:task.status,message:task.message,at:task.updatedAt||task.createdAt}]).sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0));}

export function applicationPresentationModel(tasks,jobId){
 const run=applicationRun(tasks,jobId),prepare=run.prepare,fill=run.fill,current=run.current;
 const active=task=>Boolean(task&&['queued','running'].includes(task.status));
 const failed=task=>task?.status==='failed';
 const waiting=task=>task?.status==='needs_you'||task?.status==='paused';
 const submitted=fill?.submissionOutcome==='confirmed';
 const stages=[
  {id:'documents',label:'Prepare documents',status:prepare?.hasArtifacts?'complete':failed(prepare)?'failed':active(prepare)?'active':'idle',detail:prepare?.hasArtifacts?'Job-specific resume ready':'Prioritize verified resume experience'},
  {id:'application',label:'Fill application',status:submitted||fill?.finalReviewReady?'complete':failed(fill)?'failed':active(fill)?'active':waiting(fill)?'waiting':'idle',detail:submitted?'Employer submission recorded':fill?.finalReviewReady?'Known answers and resume checked':'Enter and verify supported answers'},
  {id:'review',label:'Your review',status:submitted||run.approved?'complete':fill?.finalReviewReady?'waiting':waiting(fill)?'waiting':'idle',detail:submitted?'Review complete':fill?.finalReviewReady?'Ready for you to review':'Daymark will pause here before submission'},
  {id:'submit',label:'Submit application',status:submitted?'complete':fill?.stage==='Submitting'&&active(fill)?'active':fill?.finalReviewReady?'waiting':'idle',detail:submitted?'Submission confirmed':fill?.finalReviewReady?'Waiting for your decision':'No submission recorded'},
 ];
 const kind=fill?.reviewState?.kind;
 const reviewLabels={answers_needed:'Your answer is needed',verification_required:'Employer verification needed',authentication_required:'Sign in to continue',legal_review_required:'Consent needs review',control_review_required:'Manual step needed',flow_intervention:'Application flow needs attention',submission_confirmation_required:'Check submission status',final_review_required:'Final review ready'};
 const title=submitted?'Application submitted':fill?.finalReviewReady?'Final review ready':failed(current)?'Needs attention':kind?reviewLabels[kind]||'Waiting for you':current?.stage||'Working in the background';
 const message=fill?.finalReviewReady&&!submitted?'The form is filled and the tailored resume is attached. Review everything before taking the next step.':displayTaskMessage(current?.message||'Daymark is working in the background.');
 return {current:{title,message,status:current?.status||'idle',at:current?.updatedAt||current?.createdAt||''},stages,events:runActivity(tasks,jobId).slice(0,6).map(item=>({...item,message:displayTaskMessage(item.message||item.status)})),submitted};
}
