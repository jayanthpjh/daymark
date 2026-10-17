// Review edits API: edit answers at final review, which clears the approval and requeues the fill to re-check the employer form.
// Real server, temp data dir, worker paused; no browser, model or employer is contacted.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-review-edits-'));await fs.mkdir(path.join(dir,'files'));
await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=synthetic-test-key\n');
await fs.writeFile(path.join(dir,'pause-worker.mjs'),'const original=globalThis.setInterval;globalThis.setInterval=(callback,delay,...args)=>original(delay===500?()=>{}:callback,delay,...args);');
const q=(id,label,extra={})=>({id,label,type:'text',required:true,value:'',options:[],manual:false,...extra});
const now=new Date().toISOString();
const fill=(id,extra={})=>({id,type:'fill',jobId:'a',parentTaskId:'p'+id,status:'needs_you',stage:'Awaiting your review',progress:96,finalReviewReady:true,createdAt:now,updatedAt:now,
 submissionApproval:{approvedAt:now,token:'old'},
 checkpoint:{id:'cp'+id,step:'Application',url:'https://x.test',capturedAt:now,questions:[q('phone','Phone',{value:'555-0100'}),q('city','City',{value:'Austin'})]},
 filledSteps:[{step:'Earlier',questions:[q('first','First name',{value:'Alex'})]}],...extra});
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({profile:{name:'Alex Doe',resumeText:'r',email:'apply@example.test'},onboarding:{profileConfirmed:true},answerPack:{version:2,values:{},completed:true},
 jobs:[{id:'a',role:'Data Engineer',company:'Acme',url:'https://boards.greenhouse.io/acme/jobs/1'}],
 tasks:[fill('a1'),fill('a2',{finalReviewReady:false,status:'running'})],applications:[]}));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const child=spawn(process.execPath,['--import',path.join(dir,'pause-worker.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env')},stdio:'ignore'});
const post=(route,body)=>fetch(`http://127.0.0.1:${port}${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const read=async()=>JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));
const ok=name=>console.log('ok - '+name);
try{
 for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 let r=await post('/api/tasks/a1/review-edits',{edits:{first:'Alexander'}});assert.equal(r.status,409);assert.match((await r.json()).error,/Resolve this step/);
 assert.equal((await read()).tasks[0].status,'needs_you');ok('a field on another step is refused and nothing changes');
 r=await post('/api/tasks/a2/review-edits',{edits:{phone:'555-0199'}});assert.equal(r.status,409);ok('an application not at final review cannot be edited');
 r=await post('/api/tasks/a1/review-edits',{edits:{phone:'555-0100'}});assert.equal(r.status,400);ok('an unchanged value is refused');
 r=await post('/api/tasks/a1/review-edits',{checkpointId:'stale',edits:{phone:'555-0199'}});assert.equal(r.status,409);ok('a stale checkpoint is refused');
 r=await post('/api/tasks/a1/review-edits',{checkpointId:'cpa1',edits:{phone:'555-0199'}});assert.equal(r.status,202);const body=await r.json();assert.deepEqual(body.changed,['Phone']);
 const t=(await read()).tasks.find(x=>x.id==='a1');
 assert.equal(t.status,'queued');assert.equal(t.finalReviewReady,false);assert.equal(t.submissionApproval,null,'the earlier approval no longer applies');
 assert.deepEqual(t.pendingAnswers,{phone:'555-0199'});assert.deepEqual(t.reviewEdits.map(e=>e.fields),[['Phone']]);
 assert.equal(JSON.stringify(t.reviewEdits).includes('555-0199'),false,'the audit trail keeps labels, not values');
 ok('an edit clears the approval and queues the fill to apply and re-check it');
 r=await post('/api/tasks/a1/review-edits',{edits:{city:'Dallas'}});assert.equal(r.status,409);ok('a queued application cannot be edited again until it returns to review');
 console.log('PASS: review edits');
}catch(e){console.error(e);process.exitCode=1;}finally{child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});}
