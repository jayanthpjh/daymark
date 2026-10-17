// Removing applications and expired jobs, and changing a status by hand. Real server, temp data dir, worker paused.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-removal-'));await fs.mkdir(path.join(dir,'files'));
await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=synthetic\n');
await fs.writeFile(path.join(dir,'pause-worker.mjs'),'const o=globalThis.setInterval;globalThis.setInterval=(c,d,...a)=>o(d===500?()=>{}:c,d,...a);');
const day=n=>new Date(Date.now()-n*86_400_000).toISOString();const now=day(0);
const job=(id,extra={})=>({id,company:'Co '+id,role:'Data Engineer',url:`https://boards.greenhouse.io/${id}/jobs/1`,posted:day(2),...extra});
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({profile:{name:'Alex Doe',resumeText:'r',email:'apply@example.test'},onboarding:{profileConfirmed:true},answerPack:{version:2,values:{},completed:true},preferences:{jobPulling:{scheduleMinutes:0,maxAgeDays:30}},
 jobs:[job('a1'),job('b2'),job('c3'),job('d4'),job('ats-old',{posted:day(90)}),job('ats-closed',{closedAt:day(1)}),job('ats-fresh')],
 applications:[{id:'ap1',jobId:'a1',company:'Co a1',status:'submitted',submittedAt:now,statusHistory:[]},{id:'ap2',jobId:'b2',company:'Co b2',status:'skipped'},{id:'ap3',jobId:'c3',company:'Co c3',status:'in_progress'},{id:'ap4',jobId:'d4',company:'Co d4',status:'unconfirmed'}],
 tasks:[{id:'1111aaaa',type:'prepare',jobId:'a1',status:'completed',createdAt:now},{id:'2222bbbb',type:'fill',jobId:'c3',status:'running',createdAt:now}]}));
const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
const child=spawn(process.execPath,['--import',path.join(dir,'pause-worker.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env')},stdio:'ignore'});
const call=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,body:await r.json().catch(()=>({}))};};
const ok=name=>console.log('ok - '+name);
const state=async()=>(await call('/api/state')).body;
try{
  for(let i=0;i<100&&(await call('/api/health').catch(()=>({status:0}))).status!==200;i++)await new Promise(r=>setTimeout(r,100));
  // status by hand
  let r=await call('/api/applications/d4/status',{status:'withdrawn'});assert.equal(r.status,200);
  assert.equal((await state()).applications.find(a=>a.jobId==='d4').status,'withdrawn');
  assert.equal((await call('/api/applications/d4/status',{status:'bogus'})).status,400);ok('an application status can be changed by hand');

  assert.equal((await call('/api/applications/remove',{jobIds:['b2']})).status,400);ok('removal needs confirmation');
  assert.equal((await call('/api/applications/remove',{confirmed:true,jobIds:[]})).status,400);
  r=await call('/api/applications/remove',{confirmed:true,jobIds:['c3']});assert.equal(r.status,409);assert.match(r.body.error,/Cancel it first|work still running/);
  assert.ok((await state()).applications.some(a=>a.jobId==='c3'));ok('an application with running work is not removed');
  r=await call('/api/applications/remove',{confirmed:true,jobIds:['a1']});assert.equal(r.status,409);assert.equal(r.body.needsSubmittedConfirmation,true);
  assert.ok((await state()).applications.some(a=>a.jobId==='a1'));ok('a submitted application needs a second confirmation');

  r=await call('/api/applications/remove',{confirmed:true,jobIds:['b2','d4']});assert.equal(r.status,200);assert.equal(r.body.removed.applications,2);
  let st=await state();assert.ok(!st.applications.some(a=>['b2','d4'].includes(a.jobId)));assert.ok(st.jobs.some(j=>j.id==='b2'),'the posting stays by default');
  const backups=await fs.readdir(path.join(dir,'backups'));assert.equal(backups.length,1);
  const saved=JSON.parse(await fs.readFile(path.join(dir,'backups',backups[0]),'utf8'));assert.ok(saved.applications.some(a=>a.jobId==='b2'),'the backup still has what was removed');
  assert.equal(r.body.backup,backups[0]);ok('removal deletes the records, keeps the postings, and writes a backup first');

  r=await call('/api/applications/remove',{confirmed:true,includeSubmitted:true,alsoRemoveJobs:true,jobIds:['a1']});assert.equal(r.status,200);
  st=await state();assert.ok(!st.jobs.some(j=>j.id==='a1'));assert.ok(!st.tasks.some(t=>t.jobId==='a1'));assert.ok(st.tasks.some(t=>t.id==='2222bbbb'));ok('a confirmed removal can take the posting with it, and other work is untouched');

  r=await call('/api/jobs/expired');assert.equal(r.body.count,2);assert.equal(r.body.closed,1);assert.equal(r.body.old,1);ok('expired jobs are counted: closed by the employer, or older than the limit');
  assert.equal((await call('/api/jobs/expired/remove',{})).status,400);
  r=await call('/api/jobs/expired/remove',{confirmed:true});assert.equal(r.body.removed,2);
  st=await state();assert.deepEqual(st.jobs.map(j=>j.id).sort(),['c3','d4','b2','ats-fresh'].sort());assert.equal((await fs.readdir(path.join(dir,'backups'))).length,3);
  assert.equal((await call('/api/jobs/expired')).body.count,0);ok('expired jobs are removed after a backup, and fresh and started jobs stay');
  console.log('PASS: removal');
}catch(e){console.error(e);process.exitCode=1;}finally{child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});}
