// Feed freshness end to end: a job missing from two employer listings in a row is closed and hidden from new work; a job the
// employer closed is refused before any preparing. Real server, temp data dir, mocked internet (one fake Greenhouse board).
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {newRecord} from '../job-sources/registry.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-freshness-'));await fs.mkdir(path.join(dir,'files'));await fs.mkdir(path.join(dir,'job-sources'));
await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=synthetic\n');
const listingFile=path.join(dir,'listing.json');
const setListing=ids=>fs.writeFile(listingFile,JSON.stringify(ids));
// The fake internet: one Greenhouse board whose open jobs come from listing.json; every other host answers empty.
await fs.writeFile(path.join(dir,'preload.mjs'),`
import fs from 'node:fs';
const f=globalThis.fetch;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const listing=()=>JSON.parse(fs.readFileSync(${JSON.stringify(listingFile)},'utf8'));
const job=id=>({id,title:id===1?'Data Engineer':'Data Engineer '+'I'.repeat(id),location:{name:'Remote'},absolute_url:'https://boards.greenhouse.io/acme/jobs/'+id,content:'Python SQL',first_published:new Date().toISOString()});
globalThis.fetch=async(u,x)=>{
  const url=String(u);
  if(url.includes('boards-api.greenhouse.io/v1/boards/acme/jobs/')){const id=Number(url.split('/jobs/')[1].split('?')[0]);return listing().includes(id)?json(job(id)):json({},404);}
  if(url.includes('boards-api.greenhouse.io/v1/boards/acme/jobs'))return json({jobs:listing().map(job)});
  if(url.includes('boards-api.greenhouse.io/v1/boards/acme'))return json({name:'Acme Corporation'});
  if(url.includes('integrate.api.nvidia.com'))return f(u,x);
  if(/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)/.test(url))return f(u,x);
  return json([]);
};`);
const now=Date.now();
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({profile:{name:'Alex Doe',resumeText:'r',masterResumeText:'Python SQL data engineer',email:'apply@example.test',roleSearch:'Data Engineer',locationSearch:''},onboarding:{profileConfirmed:true},preferences:{jobPulling:{scheduleMinutes:0,maxAgeDays:30}},answerPack:{version:2,values:{},completed:true},jobs:[],tasks:[],applications:[]}));
const seedRegistry=()=>fs.writeFile(path.join(dir,'job-sources','registry.json'),JSON.stringify({version:1,boards:[{...newRecord({ats:'greenhouse',token:'acme'},'test',now-1000),nextPollAt:0}]}));
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
let child;
const start=async()=>{
  await seedRegistry();
  child=spawn(process.execPath,['--import',path.join(dir,'preload.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env'),DAYMARK_DISABLE_SEED_BOARDS:'1'},stdio:['ignore','ignore','inherit']});
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw new Error('server did not start');
};
// SIGTERM lets the server release its worker lock, so the next start in the same folder is allowed.
const stop=async()=>{if(!child)return;const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child?.kill('SIGKILL'),8000);await done;clearTimeout(timer);child=null;await fs.rm(path.join(dir,'worker.lock'),{force:true});};
const call=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,body:await r.json().catch(()=>({}))};};
const until=async predicate=>{for(let i=0;i<200;i++){const state=(await call('/api/state')).body;if(predicate(state))return state;await new Promise(r=>setTimeout(r,200));}throw new Error('timed out waiting for API state');};
const collect=async()=>{
  const r=await call('/api/collect',{});assert.equal(r.status,202,JSON.stringify(r.body));
  const id=r.body.task.id;
  for(let i=0;i<200;i++){const t=(await call('/api/state')).body.tasks.find(x=>x.id===id);if(t&&['completed','failed'].includes(t.status)){assert.equal(t.status,'completed',t.message);return t;}await new Promise(r=>setTimeout(r,200));}
  throw new Error('collection did not finish');
};
const jobs=async()=>(await call('/api/state')).body.jobs.filter(j=>String(j.id).startsWith('ats-'));
const byTitle=(list,title)=>list.find(j=>j.role===title);
const ok=name=>console.log('ok - '+name);
try{
  await setListing([1,2,3]);await start();
  const simultaneous=await Promise.all([call('/api/collect',{}),call('/api/collect',{})]);
  assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,202]);
  assert.equal(simultaneous[0].body.task.id,simultaneous[1].body.task.id,'concurrent page and scheduler starts share one collection');
  const firstId=simultaneous[0].body.task.id;
  const initial=await until(s=>s.tasks.some(t=>t.id===firstId&&['completed','failed'].includes(t.status)));
  let task=initial.tasks.find(t=>t.id===firstId);assert.equal(task.status,'completed',task.message);
  let list=await jobs();
  assert.equal(list.length,3);assert.ok(list.every(j=>j.board==='acme'&&j.company==='Acme Corporation'&&!j.closedAt));ok('a collection adds the board\'s jobs with their board and the real company name');
  const stamp=list[0].last_seen_at;
  await stop();await setListing([1,2]);await start();
  task=await collect();list=await jobs();
  assert.equal(byTitle(list,'Data Engineer III').missedPolls,1);assert.equal(byTitle(list,'Data Engineer III').closedAt,undefined);ok('one missed listing is only counted, not closed');
  assert.ok(byTitle(list,'Data Engineer').last_seen_at>=stamp,'jobs still listed are stamped as confirmed open');
  await stop();await start();
  task=await collect();list=await jobs();
  const closed=byTitle(list,'Data Engineer III');assert.ok(closed.closedAt);assert.match(closed.closedReason,/No longer listed/);assert.match(task.message,/1 job closed by the employer/);ok('missing from two listings in a row: marked closed, and the collection says so');
  assert.equal(list.filter(j=>!j.closedAt).length,2);

  const refused=await call('/api/tasks',{jobId:closed.id});
  assert.equal(refused.status,409);assert.match(refused.body.error,/closed/i);
  assert.equal((await call('/api/state')).body.tasks.filter(t=>t.type==='prepare').length,0);ok('applying to a closed job is refused and prepares nothing');

  // The employer takes down job 1 between collections: the single-posting check catches it before any work starts.
  await setListing([2]);
  const stale=byTitle(await jobs(),'Data Engineer');assert.ok(!stale.closedAt,'not yet marked: no collection has run');
  const caught=await call('/api/tasks',{jobId:stale.id});
  assert.equal(caught.status,409);assert.match(caught.body.error,/taken it down/);
  assert.ok(byTitle(await jobs(),'Data Engineer').closedAt,'it is marked closed now');ok('a job closed since the last collection is caught by the open check');

  // The Discover card's "Check still open" button.
  const two=byTitle(await jobs(),'Data Engineer II');
  const still=await call(`/api/jobs/${two.id}/check-open`,{});assert.equal(still.status,200);assert.equal(still.body.status,'open');
  assert.ok((await jobs()).find(j=>j.id===two.id).last_seen_at>=two.last_seen_at);
  const gone=await call(`/api/jobs/${closed.id}/check-open`,{});assert.equal(gone.status,409);assert.equal(gone.body.closed,true);
  assert.equal((await call('/api/jobs/nope/check-open',{})).status,404);ok('Check still open confirms an open job and reports a closed one');

  // A reopened posting returns.
  await stop();await setListing([1,2,3]);await start();
  await collect();list=await jobs();
  assert.equal(list.filter(j=>j.closedAt).length,0);ok('a job that reappears is reopened');
  console.log('PASS: feed freshness');
}catch(e){console.error(e);process.exitCode=1;}finally{await stop();await fs.rm(dir,{recursive:true,force:true});}
