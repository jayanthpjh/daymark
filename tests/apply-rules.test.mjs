import test from 'node:test';import assert from 'node:assert/strict';
import {planAutoApply,skipReason,normalizePreferences,salaryCeiling} from '../apply-rules.mjs';
const now=Date.parse('2026-10-05T12:00:00Z'),recent=new Date(now-86400000).toISOString(),old=new Date(now-20*86400000).toISOString();
const job=(id,extra={})=>({id,company:'Acme',role:'Data Engineer',location:'Remote',description:'Build pipelines.',match:80,first_seen_at:recent,url:'https://x.example/'+id,...extra});
const rules=normalizePreferences({}).skipRules;
test('clearance, excluded company/title, salary floor and remote-only produce readable reasons',()=>{
  assert.match(skipReason(job('a',{description:'Active Secret clearance required.'}),rules).reason,/clearance/);
  assert.match(skipReason(job('b',{description:'Must hold a TS/SCI.'}),rules).rule,/clearance/);
  assert.equal(skipReason(job('c',{description:'No clearance needed? We value clarity.'}),rules),null);
  const custom=normalizePreferences({skipRules:{excludedCompanies:'Initech, Globex',excludedTitles:['intern'],minSalary:150000,remoteOnly:true}}).skipRules;
  assert.match(skipReason(job('d',{company:'Globex Corp'}),custom).reason,/Globex/);
  assert.match(skipReason(job('e',{role:'Data Engineering Intern'}),custom).reason,/intern/);
  assert.match(skipReason(job('f',{salary:'$110,000–$130,000'}),custom).reason,/130,000/);
  assert.equal(skipReason(job('g',{salary:''}),custom),null,'unknown pay is not a reason to skip');
  assert.match(skipReason(job('h',{location:'Austin, TX',description:'Onsite.'}),custom).reason,/remote/i);
  assert.equal(salaryCeiling(job('i',{salary:'$150k - $190k'})),190000);
});
test('auto-apply takes best matches above the threshold within the daily cap and skips rule hits',()=>{
  const jobs=[job('low',{match:60}),job('a',{match:91}),job('b',{match:75}),job('c',{match:88}),job('clr',{match:95,description:'Top Secret clearance required'}),job('old',{match:99,first_seen_at:old}),job('done',{match:99})];
  const plan=planAutoApply(jobs,{prefs:{autoApply:{dailyCap:2}},tasks:[{type:'prepare',jobId:'done'}],now});
  assert.deepEqual(plan.apply.map(j=>j.id),['a','c']);assert.deepEqual(plan.skip.map(s=>s.job.id),['clr']);
  assert.equal(planAutoApply(jobs,{prefs:{autoApply:{dailyCap:2}},usedToday:2,now}).apply.length,0,'cap respected');
  assert.equal(planAutoApply(jobs,{prefs:{autoApply:{enabled:false}},now}).apply.length,0);
  const again=planAutoApply(jobs,{prefs:{},applications:[{jobId:'clr',status:'skipped'}],tasks:[{type:'prepare',jobId:'a'}],now});
  assert.ok(!again.skip.some(s=>s.job.id==='clr')&&!again.apply.some(j=>j.id==='a'),'already handled roles are idempotent');
  assert.deepEqual(planAutoApply(jobs,{prefs:{},now,tasks:[{type:'prepare',jobId:'done'}],canFill:j=>j.id!=='a'}).apply.map(j=>j.id),['c','b']);
});
test('defaults are 70% and 10 per day',()=>{const p=normalizePreferences({});assert.equal(p.autoApply.minMatch,70);assert.equal(p.autoApply.dailyCap,10);assert.equal(p.defaults.resumeMode,'tailored');});
