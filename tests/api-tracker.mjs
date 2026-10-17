// Tracker API: stages, ghosting with undo, notes, timeline. Real server, temp data dir, worker paused, no database.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-tracker-'));await fs.mkdir(path.join(dir,'files'));
await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=synthetic-test-key\n');
await fs.writeFile(path.join(dir,'pause-worker.mjs'),'const original=globalThis.setInterval;globalThis.setInterval=(callback,delay,...args)=>original(delay===500?()=>{}:callback,delay,...args);');
const day=n=>new Date(Date.now()-n*86_400_000).toISOString();
const appl=(id,jobId,extra={})=>({id,jobId,company:'Co '+jobId,role:'Engineer',url:`https://boards.greenhouse.io/${jobId}/jobs/1`,status:'submitted',submittedAt:day(30),createdAt:day(31),updatedAt:day(30),statusHistory:[],...extra});
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({profile:{name:'Alex Doe',resumeText:'r',email:'apply@example.test'},onboarding:{profileConfirmed:true},answerPack:{version:2,values:{},completed:true},
 jobs:[{id:'quiet',role:'Engineer',company:'Co quiet',url:'https://boards.greenhouse.io/quiet/jobs/1'},{id:'fresh',role:'Engineer',company:'Co fresh',url:'https://boards.greenhouse.io/fresh/jobs/1'},{id:'idle',role:'Engineer',company:'Co idle',url:'https://boards.greenhouse.io/idle/jobs/1'}],
 tasks:[],applications:[appl('a-quiet','quiet'),appl('a-fresh','fresh',{submittedAt:day(3)}),appl('a-idle','idle',{status:'in_progress',submittedAt:undefined})],mailEvents:[]}));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const child=spawn(process.execPath,['--import',path.join(dir,'pause-worker.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env')},stdio:'ignore'});
const call=(route,body)=>fetch(`http://127.0.0.1:${port}${route}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});
const ok=name=>console.log('ok - '+name);
const stageOf=async jobId=>(await (await call('/api/tracker')).json()).rows.find(r=>r.jobId===jobId)?.stage;
try{
 for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const view=await (await call('/api/tracker')).json();
 assert.equal(view.rows.length,3);assert.equal(view.stages.length,9);
 assert.equal(await stageOf('quiet'),'ghosted');assert.equal(await stageOf('fresh'),'applied');assert.equal(await stageOf('idle'),'saved');
 ok('stages come from stored statuses and quiet days');
 let r=await call('/api/tracker/quiet/ghost',{action:'undo'});assert.equal(r.status,200);assert.equal(await stageOf('quiet'),'applied');ok('undoing a ghosted application restarts its clock');
 r=await call('/api/tracker/idle/ghost',{action:'mark'});assert.equal(r.status,409);ok('only submitted applications can be marked ghosted');
 r=await call('/api/tracker/fresh/ghost',{action:'mark'});assert.equal(r.status,200);assert.equal(await stageOf('fresh'),'ghosted');ok('marking by hand is honored');
 assert.equal((await call('/api/tracker/fresh/ghost',{action:'bogus'})).status,400);assert.equal((await call('/api/tracker/nope/ghost',{action:'undo'})).status,404);
 r=await call('/api/tracker/fresh/note',{text:'  Emailed the recruiter\u0007  '});const notes=(await r.json()).notes;assert.equal(notes.length,1);assert.equal(notes[0].text,'Emailed the recruiter');
 assert.equal((await call('/api/tracker/fresh/note',{text:'   '})).status,400);
 const timeline=(await (await call('/api/tracker/fresh/timeline')).json()).timeline;assert.ok(timeline.some(i=>i.kind==='note'));
 r=await call('/api/tracker/fresh/note',{delete:notes[0].id});assert.equal((await r.json()).notes.length,0);ok('notes are added, shown on the timeline and removed');
 const stored=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));assert.equal(stored.applications.find(a=>a.jobId==='quiet').status,'submitted','ghosting never rewrites the stored status');ok('stored statuses are untouched');
 console.log('PASS: tracker api');
}catch(e){console.error(e);process.exitCode=1;}finally{child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});}
