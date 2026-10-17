// Edits an applicant makes to answers on the final review screen.
// Only fields on the employer step that is still open in the browser can be changed from here; anything else
// needs "Resolve this step", so a value is never typed into a page that is not showing that field.
import {validateAnswers,sameAnswer} from './application-questions.mjs';

const nothing=(code,error,extra={})=>({ok:false,code,error,...extra});

export function planReviewEdits(task,edits,{profileCountry=''}={}){
  if(task?.type!=='fill'||task.status!=='needs_you'||!task.finalReviewReady||!task.checkpoint?.questions)return nothing(409,'This application is not at its final review.');
  if(task.submitAttemptedAt)return nothing(409,'Submit was already clicked for this application. Daymark will not change it now.');
  if(!edits||typeof edits!=='object'||Array.isArray(edits)||!Object.keys(edits).length)return nothing(400,'Choose at least one answer to change.');
  const questions=task.checkpoint.questions;const byId=new Map(questions.map(q=>[q.id,q]));
  const elsewhere=[];const changed={};
  for(const [id,value] of Object.entries(edits)){
    const q=byId.get(id);
    if(!q){
      const earlier=(task.filledSteps||[]).flatMap(step=>(step.questions||[]).map(item=>({...item,step:step.step}))).find(item=>item.id===id);
      elsewhere.push(earlier?`${earlier.label} (${earlier.step})`:id);continue;
    }
    if(!sameAnswer(q,q.value,value))changed[id]=value;
  }
  if(elsewhere.length)return nothing(409,`These answers are on a different employer step than the one open now: ${elsewhere.slice(0,5).join('; ')}. Choose Resolve this step to change them in the browser.`,{elsewhere});
  if(!Object.keys(changed).length)return nothing(400,'Those answers already match the application.');
  const checked=validateAnswers(questions.map(q=>({...q,profileCountry})),changed);
  if(Object.keys(checked.errors).length)return nothing(400,'Check the marked answers.',{errors:checked.errors});
  return {ok:true,answers:checked.answers,labels:Object.keys(checked.answers).map(id=>String(byId.get(id).label||'').replace(/\*+$/,'').trim())};
}
