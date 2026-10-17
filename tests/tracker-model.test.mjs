import test from 'node:test';import assert from 'node:assert/strict';
import {stageFor,timelineFor,funnel,buildTracker,GHOST_DAYS} from '../tracker-model.mjs';

const NOW=Date.parse('2026-11-30T12:00:00Z');
const daysAgo=n=>new Date(NOW-n*86_400_000).toISOString();
const app=(extra={})=>({id:'a1',jobId:'j1',company:'Northwind',role:'Data Engineer',url:'https://boards.greenhouse.io/x/jobs/1',status:'submitted',submittedAt:daysAgo(5),statusHistory:[],...extra});
const mail=(categories,at,extra={})=>({id:`m-${at}`,jobId:'j1',categories,at,subject:categories.join(','),...extra});

test('stored statuses map onto tracker stages',()=>{
  const cases={not_started:'saved',in_progress:'saved',filled:'saved',failed:'saved',submitted:'applied',screening:'screening',interview:'interviewing',offer:'offer',rejected:'rejected',withdrawn:'withdrawn'};
  for(const [status,stage] of Object.entries(cases))assert.equal(stageFor({application:app({status}),now:NOW}).stage,stage,status);
  assert.equal(stageFor({application:app({status:'skipped'}),now:NOW}),null,'skipped applications are not tracked');
});
test('an unconfirmed submit shows as applied with a flag, not as saved',()=>{
  const r=stageFor({application:app({status:'unconfirmed'}),now:NOW});assert.equal(r.stage,'applied');assert.deepEqual(r.flags,['unconfirmed']);
});
test('an assessment email or a calendar assessment turns screening and applied into the Assessment stage',()=>{
  assert.equal(stageFor({application:app({status:'screening'}),mail:[mail(['Assessment'],daysAgo(2))],now:NOW}).stage,'assessment');
  assert.equal(stageFor({application:app(),events:[{kind:'Assessment',start:daysAgo(-3),status:'CONFIRMED'}],now:NOW}).stage,'assessment');
  assert.equal(stageFor({application:app(),events:[{kind:'Assessment',start:daysAgo(-3),status:'CANCELLED'}],now:NOW}).stage,'applied','a cancelled assessment does not count');
  assert.equal(stageFor({application:app({status:'interview'}),mail:[mail(['Assessment'],daysAgo(2))],now:NOW}).stage,'interviewing','a later stage is not pulled back');
});
test('no reply for 21 days after submitting shows Ghosted; a human reply or a confirmation changes that',()=>{
  const old=app({submittedAt:daysAgo(GHOST_DAYS+1)});
  const r=stageFor({application:old,now:NOW});assert.equal(r.stage,'ghosted');assert.deepEqual(r.flags,['automatic']);assert.equal(r.quietDays,GHOST_DAYS+1);
  assert.equal(stageFor({application:app({submittedAt:daysAgo(GHOST_DAYS-1)}),now:NOW}).stage,'applied','not yet');
  assert.equal(stageFor({application:old,mail:[mail(['Application confirmation'],daysAgo(GHOST_DAYS))],now:NOW}).stage,'ghosted','a confirmation is not a reply');
  assert.equal(stageFor({application:old,mail:[mail(['Screening'],daysAgo(3))],now:NOW}).stage,'applied','a reply restarts the quiet time');
});
test('undo restarts the quiet clock; marking ghosted by hand is honored and can itself be undone',()=>{
  const old=app({submittedAt:daysAgo(40)});
  assert.equal(stageFor({application:{...old,tracker:{ghostUndoneAt:daysAgo(2)}},now:NOW}).stage,'applied');
  assert.equal(stageFor({application:{...old,tracker:{ghostUndoneAt:daysAgo(2)}},now:NOW+25*86_400_000}).stage,'ghosted','quiet again after another 21 days');
  const manual=stageFor({application:app({tracker:{ghostedAt:daysAgo(1)}}),now:NOW});assert.equal(manual.stage,'ghosted');assert.deepEqual(manual.flags,['marked by you']);
  assert.equal(stageFor({application:app({tracker:{ghostedAt:daysAgo(3),ghostUndoneAt:daysAgo(1)}}),now:NOW}).stage,'applied');
});
test('only submitted applications can be ghosted',()=>{
  assert.equal(stageFor({application:app({status:'in_progress',submittedAt:undefined,updatedAt:daysAgo(60)}),now:NOW}).stage,'saved');
  assert.equal(stageFor({application:app({status:'screening',submittedAt:daysAgo(60)}),now:NOW}).stage,'screening');
});
test('the timeline merges status changes, mail, calendar events and notes, newest first',()=>{
  const a=app({statusHistory:[{before:'in_progress',after:'submitted',at:daysAgo(5),source:'user'}],tracker:{notes:[{id:'n1',at:daysAgo(1),text:'Emailed recruiter'}]}});
  const items=timelineFor({application:a,mail:[mail(['Interview'],daysAgo(2))],events:[{start:daysAgo(-2),kind:'Interview',summary:'Panel',status:'CONFIRMED'}]});
  assert.deepEqual(items.map(i=>i.kind),['event','note','mail','status']);
});
test('the funnel counts replies and interviews per group and flags small samples',()=>{
  const row=(stage,extra={})=>({stage,submittedAt:daysAgo(3),ats:'greenhouse',source:'search',tailoringMode:'strong',resume:'tailored',...extra});
  const rows=[...Array(5).fill(0).map((_,i)=>row(i<2?'interviewing':i<3?'screening':'applied')),row('rejected',{ats:'lever'}),row('saved',{submittedAt:null})];
  const f=funnel(rows);
  assert.equal(f.total.n,6,'unsubmitted rows are excluded from rates');assert.equal(f.total.replied,4);assert.equal(f.total.interviewed,2);assert.equal(f.stages.saved,1);
  assert.equal(f.byAts.greenhouse.n,5);assert.equal(f.byAts.greenhouse.lowSample,false);assert.equal(f.byAts.lever.lowSample,true);
  assert.equal(f.weekly.reduce((n,w)=>n+w.submitted,0),6);
});
test('buildTracker joins applications, mail, calendar and prepare tasks',()=>{
  const state={applications:[app()],mailEvents:[mail(['Screening'],daysAgo(2))],tasks:[{type:'prepare',jobId:'j1',resumeMode:'tailored',tailoringMode:'strong'}]};
  const view=buildTracker(state,{events:[{jobId:'j1',kind:'Interview',summary:'x',start:daysAgo(-4),status:'CONFIRMED'}],now:NOW});
  assert.equal(view.rows.length,1);const r=view.rows[0];assert.equal(r.ats,'greenhouse');assert.equal(r.tailoringMode,'strong');assert.equal(r.resume,'tailored');assert.ok(r.nextEvent);
  assert.equal(view.stages.find(s=>s.id==='applied').count,1);assert.equal(view.stages.length,9);
});
