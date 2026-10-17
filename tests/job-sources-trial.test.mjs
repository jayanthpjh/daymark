import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {compareSnapshots,freshnessOf,maxInWindow,parseArgs,instrumentFetch,buildReport,evaluateBar,renderMarkdown,runTrial,PASSES,POLITE} from '../scripts/job-sources-trial.mjs';

const res=(body,status=200)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
// A tiny fake internet: Common Crawl lists two Greenhouse boards and one Lever board; Remotive repeats one Greenhouse job.
function world({log=[]}={}){
  return async url=>{
    log.push(String(url));
    if(url.includes('collinfo.json'))return res([{id:'CC-1','cdx-api':'https://index.commoncrawl.org/CC-1-index'}]);
    if(url.startsWith('https://index.commoncrawl.org/CC-1-index')){
      const q=new URL(url);const pattern=q.searchParams.get('url');const page=q.searchParams.get('page');
      if(page!=='0')return res('');
      if(pattern==='boards.greenhouse.io/*')return res('{"url":"https://boards.greenhouse.io/acme/jobs/1"}\n{"url":"https://boards.greenhouse.io/beta/jobs/2"}\n');
      if(pattern==='jobs.lever.co/*')return res('{"url":"https://jobs.lever.co/gamma/abc"}\n');
      return res('');
    }
    if(url.includes('boards-api.greenhouse.io/v1/boards/acme/'))return res({meta:{name:'Acme'},jobs:[{id:1,title:'Data Engineer',location:{name:'Remote'},content:'Python SQL pipelines',absolute_url:'https://boards.greenhouse.io/acme/jobs/1'},{id:2,title:'Chef',location:{name:'Austin'},content:'Cook',absolute_url:'https://boards.greenhouse.io/acme/jobs/2'}]});
    if(url.includes('boards-api.greenhouse.io/v1/boards/beta/'))return res({jobs:[]});
    if(url.includes('api.lever.co/v0/postings/gamma'))return res([{id:'abc',text:'Senior Data Engineer',categories:{location:'Remote'},descriptionPlain:'Python',hostedUrl:'https://jobs.lever.co/gamma/abc',createdAt:1790000000000}]);
    if(url.includes('remotive.com/api'))return res({jobs:[{id:9,title:'Data Engineer',company_name:'Acme',url:'https://boards.greenhouse.io/acme/jobs/1',description:'Python SQL pipelines',candidate_required_location:'Remote'}]});
    if(url.includes('remoteok.com')||url.includes('arbeitnow.com')||url.includes('hn.algolia')||url.includes('hacker-news'))return res([]);
    return res('',404);
  };
}
const fastSleep=async()=>{};

test('arguments: passes, local-only SearXNG, and unknown flags',()=>{
  assert.equal(parseArgs([]).pass,1);assert.equal(parseArgs(['--pass','2','--roles','data engineer']).roles,'data engineer');
  assert.throws(()=>parseArgs(['--pass','4']),/--pass must be/);assert.throws(()=>parseArgs(['--pass','3']),/needs --searxng/);
  assert.throws(()=>parseArgs(['--pass','3','--searxng','https://search.example.com']),/on this machine/);
  assert.equal(parseArgs(['--pass','3','--searxng','http://127.0.0.1:8888']).searxng,'http://127.0.0.1:8888');
  assert.throws(()=>parseArgs(['--wat']),/Unknown option/);
  assert.ok(PASSES[1].maxBoardsPerRun<PASSES[2].maxBoardsPerRun&&PASSES[1].crawlPages<PASSES[2].crawlPages);
});
test('instrumentation counts requests, statuses, errors, peak concurrency and spacing per host',async()=>{
  let t=1000;const now=()=>t;
  const slow=async url=>{await new Promise(r=>setImmediate(r));if(url.includes('boom'))throw new Error('down');return res('',url.includes('limited')?429:200);};
  const m=instrumentFetch(slow,{now});
  await Promise.all([m.fetch('https://a.example/1'),m.fetch('https://a.example/2')]);t=1450;
  await m.fetch('https://a.example/limited');t=1900;await assert.rejects(m.fetch('https://b.example/boom'));
  const s=m.snapshot();
  assert.equal(s['a.example'].requests,3);assert.deepEqual(s['a.example'].statuses,{200:2,429:1});assert.equal(s['a.example'].peakActive,2);assert.equal(s['a.example'].minGapMs,0);assert.equal(s['a.example'].maxPerSecond,3);
  assert.equal(s['b.example'].errors,1);assert.equal(s['b.example'].minGapMs,null);
});
test('the report counts boards, de-duplication, fill share, scores and requests',()=>{
  const posting=(ats,canFill,extra={})=>({company:'X',title:'Data Engineer',ats,canFill,locations:['Remote'],applyUrl:'https://x/'+Math.random(),...extra});
  const scored=[{posting:posting('greenhouse',true),score:90,why:['Title matches']},{posting:posting('lever',true),score:70,why:[]},{posting:posting('ashby',false),score:50,why:[]},{posting:posting(null,false),score:30,why:[]}];
  const records=[{ats:'greenhouse',discoveredVia:'commoncrawl',lastPolledAt:1,status:'active'},{ats:'lever',discoveredVia:'harvest',lastPolledAt:1,status:'dead'},{ats:'ashby',discoveredVia:'commoncrawl',lastPolledAt:0,status:'new'}];
  const r=buildReport({params:{pass:1,roles:['data engineer'],locations:[]},stats:{directPostings:5,aggregatorMatches:2,beforeDedupe:7,afterDedupe:4,errors:{}},records,scored,hosts:{'a.example':{requests:100,statuses:{200:97,429:3},errors:0,peakActive:2,minGapMs:400,maxPerSecond:3,avgMs:10}},durationMs:5000,stateBefore:'abc',stateAfter:'abc'});
  assert.deepEqual(r.boards.bySource,{commoncrawl:2,harvest:1});assert.equal(r.boards.polled,2);assert.equal(r.boards.activeShare,50);
  assert.equal(r.postings.duplicatesRemoved,3);assert.equal(r.postings.canFillShare,50);assert.deepEqual(r.postings.keptByAts,{greenhouse:1,lever:1,ashby:1,'aggregator-only':1});
  assert.equal(r.scores.min,30);assert.equal(r.scores.max,90);assert.equal(r.http.share429,3);assert.equal(r.state.unchanged,true);assert.equal(r.top.length,4);
});
test('rate is measured per second, so one late start does not look like a burst',()=>{
  assert.equal(maxInWindow([0,400,800,1200],1000),3);assert.equal(maxInWindow([0,324,724,1124],1000),3);assert.equal(maxInWindow([0,100,200,300],1000),4);assert.equal(maxInWindow([],1000),0);
});
test('the acceptance bar passes a healthy run and flags each kind of problem',()=>{
  const base=()=>({boards:{polled:10,active:8,dead:2,activeShare:80},postings:{keptByAts:{greenhouse:3,lever:2,ashby:1},kept:10,canFillShare:70,beforeDedupe:12,afterDedupe:10,duplicatesRemoved:2},http:{share429:0.5,total429:1,totalRequests:200,hosts:{'a.example':{requests:50,peakActive:2,minGapMs:324,maxPerSecond:3}}},state:{checksumBefore:'x',unchanged:true}});
  const ok=evaluateBar(base());assert.deepEqual(ok.filter(c=>c.ok===false),[]);assert.equal(ok.find(c=>c.id==='spot-check').ok,null);
  const bad=base();bad.postings.keptByAts={greenhouse:5};bad.boards.activeShare=30;bad.http.share429=5;bad.http.hosts['a.example']={requests:50,peakActive:5,minGapMs:100,maxPerSecond:9};bad.postings.canFillShare=20;bad.state.unchanged=false;
  const failed=evaluateBar(bad).filter(c=>c.ok===false).map(c=>c.id).sort();
  assert.deepEqual(failed,['ats-types','boards-active','concurrency','fillable','spacing','state','throttling'].sort());
  assert.equal(POLITE.minGapMs,400);
});
test('a full trial on a fake internet finds boards, polls them, merges the aggregator duplicate, and writes only its report',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-trial-test-'));
  const statePath=path.join(dir,'state.json');const stateBody=JSON.stringify({profile:{roleSearch:'data engineer',locationSearch:'Remote'},jobs:[],tasks:[],applications:[]});
  await fs.writeFile(statePath,stateBody);
  const log=[];const out=path.join(dir,'out');
  const {report,checks}=await runTrial({pass:1,statePath,fetch:world({log}),sleep:fastSleep,outDir:out,log:()=>{}});
  assert.equal(report.boards.known>=3,true);assert.ok(report.boards.bySource.commoncrawl>=3);assert.deepEqual(Object.keys(report.boards.byAts).sort(),['greenhouse','lever']);
  assert.equal(report.postings.kept,2,'Data Engineer at Acme (board and aggregator copy merged) and Senior Data Engineer at Gamma; the Chef is filtered out');
  assert.ok(report.postings.duplicatesRemoved>=1);assert.equal(report.postings.canFillShare,100);
  assert.equal(report.boards.dead,1,'the empty board is dropped on its first look');
  assert.equal(report.state.unchanged,true);assert.equal(await fs.readFile(statePath,'utf8'),stateBody);
  assert.ok(log.every(u=>!/apify/.test(u)));
  const files=await fs.readdir(out);assert.equal(files.length,2);assert.match(await fs.readFile(path.join(out,files.find(f=>f.endsWith('.md'))),'utf8'),/Acceptance bar/);
  assert.ok(checks.find(c=>c.id==='state').ok);
  const md=renderMarkdown(report,checks);assert.match(md,/Top 20 postings/);assert.match(md,/Data Engineer/);
  await fs.rm(dir,{recursive:true,force:true});
});
test('a trial with no roles stops before any request is made',async()=>{
  const log=[];
  await assert.rejects(runTrial({pass:1,fetch:world({log}),sleep:fastSleep,log:()=>{}}),/No roles to search for/);
  assert.equal(log.length,0);
});
test('the throwaway registry is deleted unless asked to keep',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-trial-keep-'));
  const a=await runTrial({pass:1,roles:'data engineer',fetch:world(),sleep:fastSleep,log:()=>{}});assert.equal(a.tempRegistry,null);
  const b=await runTrial({pass:1,roles:'data engineer',fetch:world(),sleep:fastSleep,keep:true,log:()=>{}});
  assert.ok(b.tempRegistry);await fs.access(path.join(b.tempRegistry,'registry.json'));await fs.rm(b.tempRegistry,{recursive:true,force:true});await fs.rm(dir,{recursive:true,force:true});
});

test('freshness counts posting ages and complete board listings',()=>{
  const now=Date.parse('2026-10-20T00:00:00Z');const day=n=>new Date(now-n*86_400_000).toISOString();
  const f=freshnessOf([{postedAt:day(2)},{postedAt:day(10)},{postedAt:day(40)},{postedAt:day(200)},{postedAt:''}],{'greenhouse:a':{ids:['1','2']},'lever:b':{ids:['3']}},now);
  assert.deepEqual(f,{dated:4,undated:1,under7:1,under30:1,under90:1,older:1,snapshotBoards:2,snapshotJobs:3});
  assert.equal(parseArgs(['--max-age','14']).maxAgeDays,14);
});
test('a trial reports freshness and applies the age limit',async()=>{
  const {report}=await runTrial({pass:1,roles:'data engineer',fetch:world(),sleep:fastSleep,log:()=>{}});
  assert.ok(report.freshness.snapshotBoards>=1);assert.equal(typeof report.freshness.undated,'number');
});

test('snapshots are compared per board: still listed, missing and newly listed',()=>{
  const prev={at:'T0',boards:{'greenhouse:a':{ids:['1','2','3'],items:[{id:'3',url:'https://x/3',title:'T3',company:'A'}]},'lever:b':{ids:['9']}}};
  const cur={'greenhouse:a':{ids:['1','2','4']},'ashby:c':{ids:['7']}};
  const c=compareSnapshots(prev,cur);
  assert.deepEqual([c.boardsCompared,c.jobsBefore,c.stillListed,c.missing,c.newlyListed],[1,3,2,1,1],'a board polled only in one run is not compared');
  assert.deepEqual(c.sampleMissing,[{board:'greenhouse:a',id:'3',url:'https://x/3',title:'T3',company:'A'}]);
  assert.equal(compareSnapshots(null,cur).boardsCompared,0);
});
test('a persisted run followed by a resumed run shows which jobs vanished and checks them against the employer',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-trial-persist-'));
  let open=[1,2,3];
  const jobFor=id=>({id,title:`Data Engineer ${'I'.repeat(id)}`,location:{name:'Remote'},absolute_url:`https://boards.greenhouse.io/acme/jobs/${id}`,content:'Python SQL'});
  const fetch=async url=>{
    if(url.includes('collinfo.json'))return res([{id:'CC-1','cdx-api':'https://index.commoncrawl.org/CC-1-index'}]);
    if(url.startsWith('https://index.commoncrawl.org/CC-1-index')){const q=new URL(url);return res(q.searchParams.get('page')==='0'&&q.searchParams.get('url')==='boards.greenhouse.io/*'?'{"url":"https://boards.greenhouse.io/acme/jobs/1"}\n':'');}
    const single=url.match(/boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs\/(\d+)/);
    if(single)return open.includes(Number(single[1]))?res(jobFor(Number(single[1]))):res('',404);
    if(url.includes('boards-api.greenhouse.io/v1/boards/acme/jobs'))return res({jobs:open.map(jobFor)});
    if(url.includes('boards-api.greenhouse.io/v1/boards/acme'))return res({name:'Acme'});
    return res([]);
  };
  const first=await runTrial({pass:1,roles:'data engineer',fetch,sleep:fastSleep,persistDir:dir,log:()=>{}});
  assert.equal(first.report.comparison.previousAt,null);assert.equal(first.report.freshness.snapshotJobs,3);
  await assert.rejects(runTrial({pass:1,roles:'data engineer',fetch,sleep:fastSleep,persistDir:path.join(dir,'empty'),resume:true,log:()=>{}}),/Nothing to resume/);
  open=[1,2];
  const second=await runTrial({pass:1,roles:'data engineer',fetch,sleep:fastSleep,persistDir:dir,resume:true,log:()=>{}});
  const c=second.report.comparison;
  assert.deepEqual([c.boardsCompared,c.jobsBefore,c.stillListed,c.missing,c.newlyListed],[1,3,2,1,0]);
  assert.equal(c.verified.length,1);assert.equal(c.verified[0].answer,'closed','the employer site agrees it is gone');assert.match(c.verified[0].title,/III/);
  assert.match(renderMarkdown(second.report,second.checks),/Compared with the previous run/);
  await fs.rm(dir,{recursive:true,force:true});
});
