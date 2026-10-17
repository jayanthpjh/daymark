import test from 'node:test';import assert from 'node:assert/strict';
import {createAgentActions} from '../agent-actions.mjs';

const q=(id,label,extra={})=>({id,label,type:'text',required:true,value:'',options:[],manual:false,...extra});
const baseState=()=>({
  jobs:[{id:'j1',company:'Acme',role:'Data Engineer',url:'https://boards.greenhouse.io/acme/jobs/1'}],
  tasks:[
    {id:'p1',type:'prepare',jobId:'j1',status:'ready_for_review',artifacts:{approved:true}},
    {id:'f1',type:'fill',jobId:'j1',parentTaskId:'p1',status:'needs_you',finalReviewReady:true,checkpoint:{id:'cp1',step:'Application',questions:[q('city','City'),q('sms','I consent to receive SMS',{type:'radio',options:[{label:'Yes',value:'Yes'},{label:'No',value:'No'}]}),q('visa','Visa status?',{type:'select',options:[{label:'Yes',value:'Yes'},{label:'No',value:'No'}]})]}},
  ],
});
function setup(state=baseState(),over={}){
  const calls=[];
  const deps={readState:async()=>state,importJobUrl:async url=>{calls.push(['import',url]);return {id:'j2',company:'Beta',role:'SRE'};},startCollect:async()=>{calls.push(['collect']);return {id:'c1'};},
    queuePrepare:async(job,o)=>{calls.push(['prepare',job.id,o]);return {id:'p2'};},fillTask:async a=>{calls.push(['fill',a]);},submitTask:async a=>{calls.push(['submit',a]);},
    saveMailDraft:async d=>{calls.push(['draft',d]);return {draft:{id:'d1'}};},queueAnswer:async a=>{calls.push(['answer',a]);},reviewTokenFor:async()=>'tok-A',...over};
  return {actions:createAgentActions(deps),calls,state};
}

test('change actions run through the same entry points as the screens',async()=>{
  const {actions,calls}=setup();
  assert.equal((await actions.change.add_job_link({url:'https://x.example/job'})).job.id,'j2');
  assert.deepEqual((await actions.change.collect_jobs()).task,{id:'c1'});
  const p=await actions.change.prepare_application({jobId:'j1',tailoringMode:'strong'});assert.equal(p.status,'queued');
  assert.deepEqual(calls.map(c=>c[0]),['import','collect','prepare']);
  assert.equal((await actions.change.prepare_application({jobId:'nope'})).status,'not_found');
});
test('fill: the card says nothing is submitted; running it starts the fill on the prepared task',async()=>{
  const prepared=baseState();prepared.tasks=[prepared.tasks[0]];
  const {actions,calls}=setup(prepared);
  const card=await actions.approve.fill_application.check({jobId:'j1'});
  assert.match(card.summary,/Fill the employer form for Acme/);assert.match(card.summary,/Nothing is submitted/);
  assert.equal(await actions.approve.fill_application.verify({jobId:'j1'}),card.binding);
  await actions.approve.fill_application.run({jobId:'j1'});assert.deepEqual(calls,[['fill',{taskId:'p1'}]]);
});
test('fill is refused without prepared documents or when one is already filling',async()=>{
  const none=setup({...baseState(),tasks:[]});assert.match((await none.actions.approve.fill_application.check({jobId:'j1'})).error,/Prepare the documents/);
  assert.match((await setup().actions.approve.fill_application.check({jobId:'zzz'})).error,/not found/);
  assert.match((await setup().actions.approve.fill_application.check({jobId:'j1'})).error,/already being filled/);
});
test('submit: bound to the review token; a changed review no longer matches; running passes the token the card was shown for',async()=>{
  let token='tok-A';const {actions,calls}=setup(baseState(),{reviewTokenFor:async()=>token});
  const card=await actions.approve.submit_application.check({taskId:'f1'});
  assert.match(card.summary,/Submit the application for Acme/);assert.match(card.summary,/cannot be undone/);assert.equal(card.binding,'tok-A');
  token='tok-B';assert.notEqual(await actions.approve.submit_application.verify({taskId:'f1'}),card.binding);
  token='tok-A';await actions.approve.submit_application.run({taskId:'f1'});assert.deepEqual(calls,[['submit',{taskId:'f1',expectedReview:'tok-A'}]]);
});
test('submit is refused unless the application is at final review with an approved resume and no earlier click',async()=>{
  for(const [mut,pattern] of [[s=>{s.tasks[1].status='running';},/not at its final review/],[s=>{s.tasks[1].finalReviewReady=false;},/not at its final review/],[s=>{s.tasks[0].artifacts.approved=false;},/Approve the resume/],[s=>{s.tasks[1].submitAttemptedAt='now';},/already clicked/]]){
    const s=baseState();mut(s);assert.match((await setup(s).actions.approve.submit_application.check({taskId:'f1'})).error,pattern);
  }
  assert.match((await setup().actions.approve.submit_application.check({taskId:'nope'})).error,/No filled application/);
});
test('mail becomes a DRAFT: the card says it is not sent, and bad recipients or header injection are refused',async()=>{
  const {actions,calls}=setup();
  const card=await actions.approve.send_mail.check({to:'sam@acme.example',subject:'Availability',body:'Thursday works.'});
  assert.match(card.summary,/as a draft in Mail/);assert.match(card.summary,/not sent until you review/);
  const out=await actions.approve.send_mail.run({to:'sam@acme.example',subject:'Availability',body:'Thursday works.'});
  assert.equal(calls[0][0],'draft');assert.equal(out.link,'/mail?draft=d1');
  for(const bad of [{to:'not-an-address',subject:'s',body:'b'},{to:'a@b.example\r\nBcc: x@y.example',subject:'s',body:'b'},{to:'a@b.example',subject:'',body:'b'},{to:'a@b.example',subject:'s',body:' '}])assert.ok((await actions.approve.send_mail.check(bad)).error,JSON.stringify(bad));
});
test('answers: a normal question is allowed and bound to its checkpoint; consent and agreement questions are never answered by the assistant',async()=>{
  const {actions,calls}=setup();
  const card=await actions.approve.answer_question.check({questionId:'visa',value:'No'});
  assert.match(card.summary,/Answer "Visa status\?" with "No" for Acme/);assert.equal(card.binding,'q:f1:cp1:visa');
  await actions.approve.answer_question.run({questionId:'visa',value:'No'});assert.deepEqual(calls[0],['answer',{taskId:'f1',checkpointId:'cp1',questionId:'visa',value:'No'}]);
  assert.match((await actions.approve.answer_question.check({questionId:'sms',value:'Yes'})).error,/Consent and agreement/);
  assert.match((await actions.approve.answer_question.check({questionId:'visa',value:'Maybe'})).error,/option|choose|available/i);
  assert.match((await actions.approve.answer_question.check({questionId:'ghost',value:'x'})).error,/not waiting/);
});
test('an answer card goes stale when the form moved to a new checkpoint',async()=>{
  const s=baseState();const {actions}=setup(s);const card=await actions.approve.answer_question.check({questionId:'visa',value:'No'});
  s.tasks[1].checkpoint={...s.tasks[1].checkpoint,id:'cp2'};
  assert.notEqual(await actions.approve.answer_question.verify({questionId:'visa'}),card.binding);
});
test('consent, resume accuracy and settings are not available to the assistant at all',()=>{
  const {actions}=setup();
  for(const name of ['answer_consent','approve_resume','change_settings'])assert.equal(actions.approve[name],undefined,name);
});
