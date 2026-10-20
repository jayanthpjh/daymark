import test from 'node:test';import assert from 'node:assert/strict';
import {streamModel,formatClock,relativeClock,isAwaitingReview} from '../public/stream-model.js';
const now=Date.parse('2026-10-04T12:00:00Z'),iso=s=>new Date(now-s*1000).toISOString();
const base={jobs:[{id:'j1',match:80},{id:'j2'}],applications:[]};
test('clock formats',()=>{assert.equal(formatClock(3725000),'01:02:05');assert.equal(relativeClock(now-5000,now),'now');assert.equal(relativeClock(now-72000,now),'01:12');});
test('review stage appears only when on or waiting',()=>{
  const tasks=[{id:'f',type:'fill',jobId:'j1',status:'needs_you',finalReviewReady:true,role:'Eng',company:'Acme',updatedAt:iso(3),createdAt:iso(60)}];
  const on=streamModel({...base,tasks,preferences:{reviewBeforeSubmit:true}},now);
  assert.deepEqual(on.stages.map(s=>s.id),['discover','score','tailor','fill','review','submit']);
  assert.equal(on.awaiting,1);assert.equal(on.events[0].badge,'ACTION');assert.equal(on.processes,1);
  const off=streamModel({...base,tasks:[],preferences:{reviewBeforeSubmit:false}},now);
  assert.ok(!off.stages.some(s=>s.id==='review'));
  assert.ok(streamModel({...base,tasks,preferences:{reviewBeforeSubmit:false}},now).stages.some(s=>s.id==='review'));
});
test('submitted and running states are derived from records',()=>{
  const tasks=[{id:'p',type:'prepare',jobId:'j1',status:'completed',hasArtifacts:true,createdAt:iso(100),updatedAt:iso(50)},{id:'f',type:'fill',jobId:'j1',status:'completed',submittedAt:iso(5),submittedBy:'agent',role:'Eng',updatedAt:iso(5),createdAt:iso(90)},{id:'p2',type:'prepare',jobId:'j2',status:'running',role:'Dev',createdAt:iso(30),updatedAt:iso(2)}];
  const m=streamModel({...base,tasks},now);
  assert.equal(m.stages.find(s=>s.id==='submit').count,1);assert.equal(m.stages.find(s=>s.id==='tailor').status,'active');
  assert.equal(m.events.find(e=>e.id==='f').title,'Submitted · Eng');assert.equal(m.events.find(e=>e.id==='p2').badge,'RUNNING');
  assert.deepEqual(m.batch,{done:1,total:2});assert.equal(m.startedAt,now-30000);
  assert.equal(isAwaitingReview({type:'fill',status:'needs_you',finalReviewReady:true,submitAttemptedAt:'x'}),false);
});
test('skipped roles and routed recruiter mail appear as SKIPPED and ACTION rows',()=>{
  const m=streamModel({...base,tasks:[],applications:[{id:'s1',jobId:'j2',company:'Globex',role:'Eng',status:'skipped',skipReason:'Role requires a security clearance',skipRule:'exclude clearance-required',updatedAt:iso(30)}],mailEvents:[{id:'m1',jobId:'j1',company:'Acme',categories:['Interview'],subject:'Interview',at:iso(5)},{id:'m2',jobId:'j1',company:'Acme',categories:['Application confirmation'],statusChange:'submitted',at:iso(60)}]},now);
  const skip=m.events.find(e=>e.id==='skip-s1');assert.equal(skip.badge,'SKIPPED');assert.match(skip.detail,/Rule: exclude clearance-required/);
  const reply=m.events.find(e=>e.id==='mail-m1');assert.equal(reply.badge,'ACTION');assert.match(reply.title,/Recruiter reply detected/);assert.equal(reply.href,'inbox');
  assert.match(m.events.find(e=>e.id==='mail-m2').detail,/submitted/);
  assert.equal(m.events[0].id,'mail-m1','newest first');
});
test('older needs-you work stays in the stream and marks the fill stage as waiting',()=>{
  const stuck={id:'capital-one-login',type:'fill',jobId:'capital-one',company:'Capital One',role:'Data Engineer',status:'needs_you',stage:'Sign in to continue',message:'Complete password recovery, then continue processing.',updatedAt:iso(3600),createdAt:iso(7200),checkpoint:{pauseReason:'entry'}};
  const collects=Array.from({length:8},(_,i)=>({id:`collect-${i}`,type:'collect',status:'completed',updatedAt:iso(i),createdAt:iso(i)}));
  const model=streamModel({...base,tasks:[stuck,...collects]},now);
  assert.ok(model.events.some(event=>event.id===stuck.id),'actionable application work must survive recent collection events');
  assert.equal(model.stages.find(stage=>stage.id==='fill').status,'waiting');
  assert.match(model.stages.find(stage=>stage.id==='fill').sub,/1 waiting/);
});
