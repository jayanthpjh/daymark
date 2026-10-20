// Find → prep → apply: auto-apply picks the best matches within the cap, skips a clearance role with its reason,
// prepares the default resume without any NVIDIA call, and Submit all submits the reviewed applications once each.
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-workflow-'));await fs.writeFile(path.join(dir,'env'),'APPLICATION_EMAIL=apply@example.test\n');
const recent=new Date(Date.now()-3600_000).toISOString();
const job=(id,match,extra={})=>({id,company:'Co '+id,role:'Data Engineer',location:'Remote',description:'Build reliable data pipelines with Spark and SQL for analytics teams.',match,first_seen_at:recent,url:`https://boards.greenhouse.io/co${id}/jobs/1`,...extra});
const master='Alex Doe\napply@example.test\n\nSUMMARY\nData engineer delivering reliable pipelines.\n\nSKILLS\nPython, SQL, Spark';
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({automaticSubmissionVersion:1,preferences:{reviewBeforeSubmit:true,autoApply:{enabled:true,minMatch:70,dailyCap:2},skipRules:{clearance:true},defaults:{resumeMode:'default',coverLetter:'off'}},
  profile:{name:'Alex Doe',email:'apply@example.test',resumeText:master,masterResumeText:master,roleSearch:'Data Engineer'},onboarding:{profileConfirmed:true,completed:true},
  jobs:[job('a',92),job('b',81),job('c',77),job('low',50),job('clr',95,{description:'Requires an active Top Secret clearance. Build pipelines.'})],tasks:[],applications:[]}));
const log=path.join(dir,'log.json');
await fs.writeFile(path.join(dir,'mock.mjs'),`import {chromium} from ${JSON.stringify(path.join(process.cwd(),'node_modules/playwright/index.mjs'))};import fs from 'node:fs';
const log={clicks:0,nvidia:0};const save=()=>fs.writeFileSync(${JSON.stringify(log)},JSON.stringify(log));save();
const realFetch=globalThis.fetch;globalThis.fetch=async(url,opts)=>{if(String(url).includes('nvidia')){log.nvidia++;save();}return realFetch(url,opts);};
function locator(selector){let value="";return {first(){return this;},count:async()=>selector.includes('logout')||selector.includes('name="name"')||selector.includes('email')||selector.includes('file')||selector.includes('input:not')?1:0,isVisible:async()=>true,fill:async(v)=>{value=v},inputValue:async()=>value,setInputFiles:async(file)=>{log.attachment=file},allTextContents:async()=>[],evaluateAll:async()=>[],getAttribute:async()=>null};}
const pages=new Map();
function makePage(){let clicked=false,attachment;const pageLocator=selector=>({...locator(selector),setInputFiles:async(file)=>{attachment=file}});const button={isVisible:async()=>true,isDisabled:async()=>false,click:async()=>{clicked=true;log.clicks++;save();}};return {evaluate:async(fn,arg)=>typeof arg==='string'?{status:attachment?.endsWith(arg)?'accepted':'missing'}:fn.toString().includes('checkValidity')?[]:clicked?'Thank you for applying':[],getByRole:(role,opts)=>role==='heading'?{first(){return this},count:async()=>0,isVisible:async()=>false}:opts?.name?.test?.('Next')?{count:async()=>0}:{count:async()=>1,nth:()=>button},isClosed:()=>false,goto:async()=>{},waitForTimeout:async()=>{},screenshot:async()=>{},locator:pageLocator,url:()=>'https://boards.greenhouse.io/x/jobs/1'};}
const context={pages:()=>[],newPage:async()=>makePage(),on:()=>{},close:async()=>{}};chromium.launchPersistentContext=async()=>context;`);
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const child=spawn(process.execPath,['--import',path.join(dir,'mock.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env'),DAYMARK_AUTOMATION_DELAY_MS:'500',DAYMARK_SUBMIT_CONFIRM_MS:'1000'},stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',c=>err+=c);
const api=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,body:await r.json().catch(()=>({}))};};
const state=async()=>(await api('/api/state')).body;const readLog=async()=>JSON.parse(await fs.readFile(log,'utf8'));
const waitFor=async(check,label)=>{for(let i=0;i<200;i++){try{const v=await check();if(v)return v}catch{}await new Promise(r=>setTimeout(r,150))}const s=await state().catch(()=>({tasks:[]}));throw new Error('timed out: '+label+' '+err+JSON.stringify(s.tasks.map(t=>[t.jobId,t.type,t.status,t.stage,t.message])))};
try{
  const ready=await waitFor(async()=>{const s=await state();const fills=s.tasks.filter(t=>t.type==='fill'&&t.status==='needs_you'&&t.finalReviewReady);return fills.length===2&&s},'two applications ready for review');
  const prepared=ready.tasks.filter(t=>t.type==='prepare');
  assert.deepEqual(prepared.map(t=>t.jobId).sort(),['a','b'],'best two matches within the cap');
  assert.ok(prepared.every(t=>t.source==='auto'&&t.resumeMode==='default'&&t.coverLetter==='off'));
  const skipped=ready.applications.filter(a=>a.status==='skipped');assert.deepEqual(skipped.map(a=>a.jobId),['clr']);assert.match(skipped[0].skipReason,/clearance/);
  assert.equal(ready.dailyAutoApply.count,2);assert.equal((await readLog()).nvidia,0,'default resume makes no NVIDIA call');
  const crossSite=await fetch(`http://127.0.0.1:${port}/api/tasks/submit-all`,{method:'POST',headers:{host:`127.0.0.1:${port}`,origin:'https://attacker.example','content-type':'application/json'},body:JSON.stringify({confirmed:true})});
  assert.equal(crossSite.status,403,'cross-site requests cannot trigger reviewed submissions');
  const rebinding=await new Promise((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port,path:'/api/tasks/submit-all',method:'POST',headers:{Host:`attacker.example:${port}`,'content-type':'application/json'}},response=>{response.resume();response.on('end',()=>resolve(response));});request.on('error',reject);request.end(JSON.stringify({confirmed:true}));});
  assert.equal(rebinding.statusCode,403,'DNS rebinding cannot reach local mutation routes');
  const held=await api('/api/tasks/submit-all',{});assert.equal(held.body.eligible.length,0,'unreviewed resumes cannot be batch submitted');
  assert.equal((await readLog()).clicks,0,'preparation never submits');
  for(const task of prepared){const reviewed=await api(`/api/tasks/${task.id}/review`,{confirmedAccurate:true,resumeText:master});assert.equal(reviewed.status,200);}
  const preview=await api('/api/tasks/submit-all',{});assert.equal(preview.body.eligible.length,2);
  const queued=await api('/api/tasks/submit-all',{confirmed:true});assert.equal(queued.status,202);assert.equal(queued.body.queued.length,2);
  const done=await waitFor(async()=>{const s=await state();return s.tasks.filter(t=>t.type==='fill'&&t.status==='completed').length===2&&s},'both submitted');
  assert.equal((await readLog()).clicks,2,'exactly one click each');
  assert.equal(done.applications.filter(a=>a.status==='submitted').length,2);assert.ok(done.applications.find(a=>a.jobId==='a').receipt);
  assert.ok(done.tasks.filter(t=>t.type==='fill').every(t=>t.submissionApproval?.actor==='user'&&t.submissionAudit?.some(e=>e.event==='SubmissionApproved')));
  const again=await api('/api/tasks/submit-all',{});assert.equal(again.body.eligible.length,0);
  const manual=await api('/api/tasks',{jobId:'clr',sendToNvidia:true});assert.equal(manual.status,201,'source-only tailoring does not need a model key');
  console.log('ok - auto-apply, skip rules, default resume, submit all');
}finally{child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});}
