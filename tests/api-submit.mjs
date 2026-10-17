// Isolated end-to-end check of review-before-submit with a mocked browser. Synthetic data only; nothing is sent anywhere.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const prepId='11111111-1111-1111-1111-111111111111',fillId='22222222-2222-2222-2222-222222222222';
const resume='Alex Doe\n\nSUMMARY\nEngineer delivering reliable data pipelines and improving platform performance.\n\nSKILLS\nPython, SQL';
async function scenario(name,{preferences,sourceProfile={name:'Alex Doe'},noConfirm=false,trusted=false},run){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-submit-'));await fs.mkdir(path.join(dir,'files'));await fs.writeFile(path.join(dir,'env'),'');
  await fs.writeFile(path.join(dir,'files','draft.pdf'),'synthetic');
  if(trusted){await fs.mkdir(path.join(dir,'adapters'));await fs.writeFile(path.join(dir,'adapters','boards.greenhouse.io.json'),JSON.stringify({host:'boards.greenhouse.io',runs:1,trust:{submitted:1}}));}
  await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({automaticSubmissionVersion:2,preferences,profile:{name:'Alex Doe',email:'apply@example.test'},onboarding:{profileConfirmed:true},jobs:[{id:'j',company:'Acme',role:'Engineer',url:'https://boards.greenhouse.io/example/jobs/1'}],tasks:[{id:fillId,type:'fill',jobId:'j',parentTaskId:prepId,status:'queued',reviewPolicy:'final'},{id:prepId,type:'prepare',jobId:'j',status:'ready_for_review',reviewPolicy:'final',artifacts:{resume,coverLetter:'Sample',resumePdf:path.join(dir,'files','draft.pdf'),resumeDocx:path.join(dir,'files','draft.docx'),sourceProfile,changes:[],proposedAdditions:[],approved:false}}],applications:[]}));
  const logPath=path.join(dir,'browser-log.json');
  await fs.writeFile(path.join(dir,'mock-browser.mjs'),`import {chromium} from ${JSON.stringify(path.join(process.cwd(),'node_modules/playwright/index.mjs'))};import fs from 'node:fs/promises';const log={clicks:0,fields:[]};const save=()=>fs.writeFile(${JSON.stringify(logPath)},JSON.stringify(log));
function locator(selector){let value="";return {first(){return this;},count:async()=>selector.includes('name="name"')||selector.includes('email')||selector.includes('file')||selector.includes('input:not')?1:0,isVisible:async()=>true,fill:async(v)=>{value=v;log.fields.push(selector)},inputValue:async()=>value,setInputFiles:async(file)=>{log.attachment=file},allTextContents:async()=>[],evaluateAll:async()=>selector.includes('input:not')?4:[]};}
const button={isVisible:async()=>true,isDisabled:async()=>false,click:async()=>{log.clicks++;await save();}};
const page={evaluate:async(fn,arg)=>typeof arg==='string'?{status:log.attachment?.endsWith(arg)?'accepted':'missing'}:fn.toString().includes('checkValidity')?[]:log.clicks&&!process.env.MOCK_NO_CONFIRM?'Thank you for applying':[],getByRole:(role,opts)=>role==='heading'?{first(){return this},count:async()=>0,isVisible:async()=>false}:opts?.name?.test?.('Next')?{count:async()=>0}:{count:async()=>1,nth:()=>button},isClosed:()=>false,goto:async()=>{},waitForTimeout:async()=>{},screenshot:async()=>{},locator,url:()=>'https://boards.greenhouse.io/example/jobs/1'};
const context={pages:()=>[page],newPage:async()=>page,on:()=>{},close:async()=>{}};chromium.launchPersistentContext=async()=>context;await save();`);
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const child=spawn(process.execPath,['--import',path.join(dir,'mock-browser.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env'),DAYMARK_SUBMIT_CONFIRM_MS:'1500',...(noConfirm?{MOCK_NO_CONFIRM:'1'}:{})},stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',c=>err+=c);
  const api=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,body:await r.json().catch(()=>({}))};};
  const state=async()=>(await api('/api/state')).body;const clicks=async()=>JSON.parse(await fs.readFile(logPath,'utf8')).clicks;
  const waitFor=async(check,label)=>{for(let i=0;i<150;i++){try{const v=await check();if(v)return v}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error(`${name}: timed out waiting for ${label}. ${JSON.stringify((await state()).tasks.map(t=>({type:t.type,status:t.status,stage:t.stage,message:t.message}))) } ${err}`)};
  try{await waitFor(async()=>(await api('/api/health')).status===200,'server start');await run({api,state,clicks,waitFor,dir});console.log('ok -',name)}finally{child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true})}
}
const fillOf=async s=>(await s()).tasks.find(t=>t.id===fillId);

await scenario('review on: waits, then approve & submit clicks exactly once',{preferences:{reviewBeforeSubmit:true}},async({api,state,clicks,waitFor})=>{
  const s=await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.status==='needs_you'&&f.finalReviewReady&&f},'awaiting review');
  assert.equal(s.stage,'Awaiting your review');assert.equal(await clicks(),0);
  assert.equal((await api(`/api/tasks/${prepId}/review`,{resumeText:resume,confirmedAccurate:true,submitAfter:true,expectedReview:'stale'})).status,409,'stale review cannot approve or submit');
  assert.equal(await clicks(),0);
  assert.equal((await state()).preferences.reviewBeforeSubmit,true);
  assert.equal((await api('/api/tasks/submit',{taskId:fillId,confirmed:true})).status,409,'cannot submit before approving the resume');
  const review=await api(`/api/tasks/${prepId}/review`,{resumeText:resume,confirmedAccurate:true,submitAfter:true});assert.equal(review.status,200,JSON.stringify(review.body));
  const done=await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.status==='completed'&&f},'submission');
  assert.equal(done.submittedBy,'agent_after_review');assert.equal(await clicks(),1);
  const final=await state();assert.equal(final.applications.find(a=>a.jobId==='j').status,'submitted');
  assert.equal((await api('/api/tasks/submit',{taskId:fillId,confirmed:true})).status,409,'no second submit');assert.equal(await clicks(),1);
});
await scenario('review off on a host with no confirmed submission still pauses at final review',{preferences:{reviewBeforeSubmit:false}},async({state,clicks,waitFor})=>{
  const fill=await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.status==='needs_you'&&f.finalReviewReady&&f},'final review');
  assert.equal(fill.stage,'Awaiting your review');assert.equal(await clicks(),0);
  const s=await state();assert.equal(s.preferences.reviewBeforeSubmit,false);assert.equal(s.tasks.find(t=>t.id===prepId).review.approvalStatus,'needs_review');assert.equal(s.applications.length,0);
});
await scenario('review off with an untrusted host cannot bypass the final-review pause',{preferences:{reviewBeforeSubmit:false},sourceProfile:{name:'Alex Doe',phone:'555-111-2222'}},async({state,clicks,waitFor})=>{
  const f=await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.status==='needs_you'&&f.finalReviewReady&&f},'final review');
  assert.equal(f.finalReviewReady,true);assert.equal(f.orchestration.state,'final_review');assert.equal(await clicks(),0);
});
await scenario('legacy bulk-submit endpoint cannot bypass individual final review',{preferences:{reviewBeforeSubmit:false}},async({api,state,clicks,waitFor})=>{
  await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.status==='needs_you'&&f.finalReviewReady&&f},'final review');
  const result=await api('/api/tasks/submit-waiting',{confirmed:true});assert.equal(result.status,409);assert.match(result.body.error,/individual review/i);assert.equal(await clicks(),0);
  assert.equal((await state()).tasks.find(t=>t.id===fillId).orchestration.state,'final_review');
});
await scenario('review off on a trusted host: clean fill submits exactly once automatically',{preferences:{reviewBeforeSubmit:false},trusted:true},async({api,state,clicks,waitFor})=>{
  const done=await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.status==='completed'&&f},'automatic submission');
  assert.equal(done.submittedBy,'agent');assert.equal(await clicks(),1);
  assert.equal((await state()).applications.find(a=>a.jobId==='j').status,'submitted');
  assert.equal((await api('/api/tasks/submit',{taskId:fillId,confirmed:true})).status,409,'no second submit');assert.equal(await clicks(),1);
});
await scenario('review off on a trusted host: no confirmation page is unconfirmed and never re-clicked',{preferences:{reviewBeforeSubmit:false},trusted:true,noConfirm:true},async({state,clicks,waitFor})=>{
  const held=await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.stage==='Submission unconfirmed'&&f},'unconfirmed');
  assert.equal(await clicks(),1);assert.equal(held.finalReviewReady,false);
});
await scenario('preference route validates and persists',{preferences:{reviewBeforeSubmit:true}},async({api,state})=>{
  assert.equal((await api('/api/preferences',{reviewBeforeSubmit:'no'})).status,400);
  assert.equal((await api('/api/preferences',{reviewBeforeSubmit:false})).status,200);assert.equal((await state()).preferences.reviewBeforeSubmit,false);
});
await scenario('no confirmation page: recorded as awaiting confirmation, never re-clicked, retry only after user clears it',{preferences:{reviewBeforeSubmit:true},noConfirm:true},async({api,state,clicks,waitFor})=>{
  await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.status==='needs_you'&&f.finalReviewReady&&f},'awaiting review');
  assert.equal((await api(`/api/tasks/${prepId}/review`,{resumeText:resume,confirmedAccurate:true,submitAfter:true})).status,200);
  const held=await waitFor(async()=>{const f=(await state()).tasks.find(t=>t.id===fillId);return f?.stage==='Submission unconfirmed'&&f},'unconfirmed');
  assert.equal(await clicks(),1);assert.equal(held.finalReviewReady,false);
  const app=(await state()).applications.find(a=>a.jobId==='j');assert.equal(app.status,'unconfirmed');
  assert.equal((await api('/api/tasks/submit',{taskId:fillId,confirmed:true})).status,409);
  const handoff=await api(`/api/tasks/${fillId}/handoff`,{showBrowser:true});assert.equal(handoff.status,200);
  await waitFor(async()=>{const f=await fillOf(state);return f?.status==='needs_you'&&f.manualHandoff},'uncertain session handoff');assert.equal(await clicks(),1);
  assert.equal((await api(`/api/tasks/${fillId}/handoff/resume`,{})).status,200);
  await waitFor(async()=>{const f=await fillOf(state);return f?.status==='needs_you'&&!f.manualHandoff},'uncertain session return');assert.equal(await clicks(),1,'handoff must never repeat Submit');
  assert.equal((await api('/api/tasks/clear-submit',{taskId:fillId})).status,400,'needs explicit confirmation');
  const cleared=await api('/api/tasks/clear-submit',{taskId:fillId,confirmed:true});assert.equal(cleared.status,200);
  const after=await state();assert.equal(after.tasks.find(t=>t.id===fillId).submitAttemptedAt,undefined);assert.equal(after.applications.find(a=>a.jobId==='j').status,'in_progress');assert.equal(await clicks(),1);
});
