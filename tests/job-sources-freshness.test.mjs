import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileJobs,jobBoardKey,withinAge,MISSES_TO_CLOSE,CLOSED_REASON,isClosed} from '../job-sources/freshness.mjs';
import {Registry,MemoryStore} from '../job-sources/registry.mjs';
import {createHttp} from '../job-sources/http.mjs';
import {runCollection,pollBoard,toDaymarkJob} from '../job-sources/collect.mjs';
import * as smartrecruiters from '../job-sources/ats/smartrecruiters.mjs';
import * as workable from '../job-sources/ats/workable.mjs';

const job=(id,extra={})=>({id,ats:'greenhouse',board:'acme',url:`https://boards.greenhouse.io/acme/jobs/${id}`,role:'Data Engineer',...extra});
const snap=(...ids)=>({'greenhouse:acme':{ids,at:'2026-10-20T00:00:00Z'}});
const NOW='2026-10-20T12:00:00Z';

test('a job missing from two complete polls in a row is closed; one miss only counts',()=>{
  const jobs=[job('ats-a'),job('ats-b')];
  let r=reconcileJobs(jobs,snap('ats-a'),NOW);
  assert.deepEqual([r.seen,r.missed,r.closed.length],[1,1,0]);assert.equal(jobs[1].missedPolls,1);assert.equal(isClosed(jobs[1]),false);
  r=reconcileJobs(jobs,snap('ats-a'),'2026-10-20T14:00:00Z');
  assert.deepEqual(r.closed,['ats-b']);assert.equal(jobs[1].closedAt,'2026-10-20T14:00:00Z');assert.equal(jobs[1].closedReason,CLOSED_REASON);assert.equal(MISSES_TO_CLOSE,2);
  assert.equal(jobs[0].last_seen_at,'2026-10-20T14:00:00Z','a listed job is stamped as confirmed open');
});
test('a reappearing job is reopened and its miss count resets',()=>{
  const jobs=[job('ats-a',{closedAt:'x',closedReason:'y',missedPolls:2})];
  const r=reconcileJobs(jobs,snap('ats-a'),NOW);
  assert.deepEqual(r.reopened,['ats-a']);assert.equal(jobs[0].closedAt,undefined);assert.equal(jobs[0].missedPolls,0);
  const j2=[job('ats-a',{missedPolls:1})];reconcileJobs(j2,snap('ats-a'),NOW);assert.equal(j2[0].missedPolls,0,'one miss followed by a sighting starts over');
});
test('boards that were not polled, and empty or missing snapshots, close nothing',()=>{
  const jobs=[job('ats-a'),job('ats-z',{board:'other',url:'https://boards.greenhouse.io/other/jobs/z'})];
  reconcileJobs(jobs,snap('ats-a'),NOW);assert.equal(jobs[1].missedPolls,undefined,'a board not polled this run is left alone');
  const j2=[job('ats-a',{missedPolls:1})];
  assert.deepEqual(reconcileJobs(j2,snap(),NOW).closed,[],'an empty list is treated as an outage');assert.equal(j2[0].missedPolls,1);
  assert.deepEqual(reconcileJobs(j2,{},NOW),{seen:0,missed:0,closed:[],reopened:[]});assert.deepEqual(reconcileJobs(j2,undefined,NOW).closed,[]);
});
test('only jobs built from a board listing are judged; manual, Apify and demo jobs never are',()=>{
  const jobs=[job('manual-1',{url:'https://boards.greenhouse.io/acme/jobs/9'}),job('apify-1',{ats:null,board:null}),job('ats-a')];
  reconcileJobs(jobs,snap('ats-a'),NOW);reconcileJobs(jobs,snap('ats-a'),NOW);
  assert.deepEqual(jobs.map(isClosed),[false,false,false]);
});
test('older jobs without a stored board are matched through their apply URL',()=>{
  const old={id:'ats-q',ats:'greenhouse',url:'https://job-boards.greenhouse.io/Acme/jobs/55'};
  assert.equal(jobBoardKey(old),'greenhouse:acme');assert.equal(jobBoardKey({url:'https://example.org/x'}),'');
  reconcileJobs([old],snap(),NOW);const missing=[old];reconcileJobs(missing,snap('ats-other'),NOW);reconcileJobs(missing,snap('ats-other'),NOW);assert.equal(isClosed(old),true);
});
test('age: postings with a date older than the limit go; undated postings stay; 0 means no limit',()=>{
  const now=Date.parse('2026-10-20T00:00:00Z');
  assert.equal(withinAge('2026-10-01T00:00:00Z',30,now),true);assert.equal(withinAge('2026-08-01T00:00:00Z',30,now),false);
  assert.equal(withinAge('',30,now),true);assert.equal(withinAge('garbage',30,now),true);assert.equal(withinAge('2020-01-01',0,now),true);
});

const res=(body,status=200)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const mkHttp=routes=>createHttp({fetch:async url=>{for(const [needle,make] of routes)if(String(url).includes(needle))return make();return res('',404);},delayMs:0,sleep:async()=>{},retries:0});
const ghJobs=(...ids)=>()=>res({jobs:ids.map(id=>({id,title:'Data Engineer',location:{name:'Remote'},absolute_url:`https://boards.greenhouse.io/acme/jobs/${id}`,content:'Python'}))});

test('a completed board poll returns every posting it listed, before any role filtering',async()=>{
  const registry=await new Registry(new MemoryStore()).init();await registry.add([{ats:'greenhouse',token:'acme'}],'t');
  const [record]=await registry.due();
  const http=mkHttp([['/boards/acme/jobs',()=>res({jobs:[{id:1,title:'Data Engineer',location:{name:'Remote'},absolute_url:'https://boards.greenhouse.io/acme/jobs/1',content:'x'},{id:2,title:'Chef',location:{name:'Austin'},absolute_url:'https://boards.greenhouse.io/acme/jobs/2',content:'y'}]})],['/boards/acme',()=>res({name:'Acme'})]]);
  const out=await pollBoard(registry,record,{http,roles:['data engineer'],canFill:()=>true});
  assert.equal(out.postings.length,1);assert.ok(out.openIds.every(id=>/^ats-[0-9a-f]{24}$/.test(id)),'snapshot ids are feed job ids');assert.equal(toDaymarkJob({posting:out.postings[0],score:1,why:[]}).id,out.openIds[0]);assert.equal(out.openIds.length,2,'the Chef is open too, even though it does not match your roles');
});
test('a failed poll gives no snapshot',async()=>{
  const registry=await new Registry(new MemoryStore()).init();await registry.add([{ats:'greenhouse',token:'acme'}],'t');
  const [record]=await registry.due();
  const out=await pollBoard(registry,record,{http:mkHttp([]),roles:['data engineer'],canFill:()=>true});
  assert.equal(out.openIds,undefined);
});
test('search-narrowed Workday lists and page-capped lists never give a snapshot',async()=>{
  const wk=await workable.fetchBoard({token:'acme'},{http:mkHttp([['/jobs',()=>res({results:[{shortcode:'A',title:'T',location:{}}],nextPage:'p2'})]]),maxPages:2});
  assert.equal(wk.truncated,true,'workable hit the page cap with more to read');
  const wkDone=await workable.fetchBoard({token:'acme'},{http:mkHttp([['/jobs',()=>res({results:[{shortcode:'A',title:'T',location:{}}]})]])});
  assert.equal(wkDone.truncated,undefined);
  const sr=await smartrecruiters.fetchBoard({token:'acme'},{http:mkHttp([['/postings',()=>res({totalFound:500,content:[{id:'1',name:'T',location:{},company:{identifier:'acme'}}]})]]),maxPages:2});
  assert.equal(sr.truncated,true);
  const registry=await new Registry(new MemoryStore()).init();await registry.add([{ats:'workday',token:'acme/wd1/site'}],'t');
  const [record]=await registry.due();
  const out=await pollBoard(registry,record,{http:mkHttp([['/wday/cxs',()=>res({jobPostings:[{title:'Data Engineer',externalPath:'/job/1',locationsText:'Austin, TX'}],total:1})]]),roles:['data engineer'],canFill:()=>true});
  assert.equal(out.openIds,null,'Workday lists are search results');
});
test('runCollection returns snapshots keyed by board, honors the age limit, and jobs carry their board',async()=>{
  const registry=await new Registry(new MemoryStore()).init();await registry.add([{ats:'greenhouse',token:'acme'}],'t');
  const http=mkHttp([['/boards/acme/jobs',()=>res({jobs:[{id:1,title:'Data Engineer',location:{name:'Remote'},absolute_url:'https://boards.greenhouse.io/acme/jobs/1',content:'Python',first_published:'2020-01-01T00:00:00Z'},{id:2,title:'Data Engineer II',location:{name:'Remote'},absolute_url:'https://boards.greenhouse.io/acme/jobs/2',content:'Python',first_published:new Date().toISOString()},{id:3,title:'Data Engineer III',location:{name:'Remote'},absolute_url:'https://boards.greenhouse.io/acme/jobs/3',content:'Python'}]})],['/boards/acme',()=>res({name:'Acme'})]]);
  const run=await runCollection({registry,http,profile:{roleSearch:'data engineer',locationSearch:'',masterResumeText:'python'},aggregators:[],maxAgeDays:30});
  assert.deepEqual(Object.keys(run.snapshots),['greenhouse:acme']);assert.equal(run.snapshots['greenhouse:acme'].ids.length,3,'the old posting is still open, so it is in the snapshot');
  assert.deepEqual(run.postings.map(p=>p.posting.title).sort(),['Data Engineer II','Data Engineer III'],'the 2020 posting is too old; the undated one stays');
  assert.equal(toDaymarkJob(run.postings[0]).board,'acme');
  const noLimit=await runCollection({registry:await (async()=>{const r=await new Registry(new MemoryStore()).init();await r.add([{ats:'greenhouse',token:'acme'}],'t');return r;})(),http,profile:{roleSearch:'data engineer',locationSearch:'',masterResumeText:'python'},aggregators:[]});
  assert.equal(noLimit.postings.length,3);
});
