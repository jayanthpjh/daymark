import test from 'node:test';import assert from 'node:assert/strict';
import {removalPlan,removeFromState,expiredJobs,removeExpired} from '../application-removal.mjs';

const NOW=Date.parse('2026-10-20T00:00:00Z');const day=n=>new Date(NOW-n*86_400_000).toISOString();
const base=()=>({
  jobs:[{id:'j1',company:'Acme',role:'DE',posted:day(2)},{id:'j2',company:'Beta',role:'DE'},{id:'j3',company:'Gamma',role:'DE'},{id:'ats-old',company:'Old Co',role:'DE',posted:day(90)},{id:'ats-closed',company:'Gone Co',role:'DE',posted:day(1),closedAt:day(1)},{id:'ats-fresh',company:'Fresh',role:'DE',posted:day(3)},{id:'manual-x',company:'Mine',role:'DE',posted:day(200)},{id:'ats-started',company:'Started',role:'DE',posted:day(200)},{id:'ats-skip',company:'Skipped',role:'DE',posted:day(200)}],
  applications:[{id:'a1',jobId:'j1',status:'submitted',company:'Acme'},{id:'a2',jobId:'j2',status:'skipped'},{id:'a3',jobId:'j3',status:'in_progress'},{id:'a4',jobId:'ats-started',status:'submitted'},{id:'a5',jobId:'ats-skip',status:'skipped'}],
  tasks:[{id:'t1',jobId:'j1',type:'prepare',status:'completed'},{id:'t2',jobId:'j1',type:'fill',status:'completed',submitAttemptedAt:day(1)},{id:'t3',jobId:'j3',type:'fill',status:'running'},{id:'c1',type:'collect',status:'completed'}],
  mailEvents:[{id:'m1',jobId:'j1'},{id:'m2',jobId:'j2'}],
});

test('a plan lists what goes, marks submitted ones, and blocks jobs with work still running',()=>{
  const p=removalPlan(base(),['j1','j2','j3','nope']);
  assert.deepEqual(p.jobIds.sort(),['j1','j2']);assert.deepEqual(p.applications.sort(),['a1','a2']);assert.deepEqual(p.tasks.sort(),['t1','t2']);
  assert.deepEqual(p.submitted,[{jobId:'j1',company:'Acme',role:'DE'}]);
  assert.equal(p.blocked.length,1);assert.equal(p.blocked[0].jobId,'j3');assert.match(p.blocked[0].reason,/Cancel it first/);assert.deepEqual(p.unknown,['nope']);
});
test('removing keeps the posting by default, can remove it too, and never touches other jobs or collection tasks',()=>{
  const s=base();const r=removeFromState(s,removalPlan(s,['j1','j2']));
  assert.deepEqual(r,{applications:2,tasks:2,jobs:0});
  assert.deepEqual(s.jobs.map(j=>j.id).slice(0,3),['j1','j2','j3'],'the postings stay in Discover');
  assert.deepEqual(s.applications.map(a=>a.id),['a3','a4','a5']);assert.deepEqual(s.tasks.map(t=>t.id),['t3','c1']);assert.deepEqual(s.mailEvents,[]);
  const s2=base();const r2=removeFromState(s2,removalPlan(s2,['j1','j2']),{alsoJobs:true});
  assert.equal(r2.jobs,2);assert.ok(!s2.jobs.some(j=>['j1','j2'].includes(j.id)));
});
test('an empty or repeated request does nothing harmful',()=>{
  const s=base();assert.deepEqual(removalPlan(s,[]).jobIds,[]);assert.deepEqual(removalPlan(s,null).jobIds,[]);
  assert.deepEqual(removalPlan(s,['j2','j2']).jobIds,['j2']);
  const before=JSON.stringify(s);removeFromState(s,removalPlan(s,[]));assert.equal(JSON.stringify(s),before);
});
test('expired jobs are closed or older than the limit, and never ones you started or imported yourself',()=>{
  const e=expiredJobs(base(),{now:NOW,maxAgeDays:30});
  assert.deepEqual(e.map(x=>[x.id,x.reason]).sort(),[['ats-closed','closed'],['ats-old','old'],['ats-skip','old']].sort());
  assert.deepEqual(expiredJobs(base(),{now:NOW,maxAgeDays:0}).map(x=>x.id),['ats-closed'],'no age limit: only closed jobs');
});
test('removing expired jobs also clears their skip records and nothing else',()=>{
  const s=base();const n=removeExpired(s,expiredJobs(s,{now:NOW,maxAgeDays:30}));
  assert.equal(n,3);assert.ok(!s.jobs.some(j=>['ats-old','ats-closed','ats-skip'].includes(j.id)));
  assert.ok(s.jobs.some(j=>j.id==='ats-started')&&s.jobs.some(j=>j.id==='manual-x')&&s.jobs.some(j=>j.id==='ats-fresh'));
  assert.deepEqual(s.applications.map(a=>a.id),['a1','a2','a3','a4'],'the skip record for a removed job goes; others stay');
});
