import test from 'node:test';import assert from 'node:assert/strict';import {applicationRun,runActivity,applicationPresentationModel,applicationStatuses,normalizeApplicationStatus,displayTaskMessage} from '../public/application-model.js';
const prepare={id:'p',type:'prepare',jobId:'j',status:'ready_for_review',reviewPolicy:'final',hasArtifacts:true,review:{approvalStatus:'needs_review'}};
test('final review waits for filling and opens once at the end',()=>{assert.equal(applicationRun([prepare],'j').finalReady,false);const fill={id:'f',type:'fill',jobId:'j',parentTaskId:'p',status:'running',progress:50};assert.equal(applicationRun([fill,prepare],'j').progress,70);assert.equal(applicationRun([fill,prepare],'j').finalReady,false);fill.status='needs_you';fill.finalReviewReady=true;assert.equal(applicationRun([fill,prepare],'j').finalReady,true);fill.finalReviewReady=false;prepare.review.approvalStatus='approved';assert.equal(applicationRun([fill,prepare],'j').finalReady,false);fill.finalReviewReady=true;assert.equal(applicationRun([fill,prepare],'j').progress,100);});
test('sign-in pauses and failed fills are not final review',()=>{const fill={type:'fill',parentTaskId:'p',jobId:'j',status:'needs_you'};assert.equal(applicationRun([fill,prepare],'j').finalReady,false);fill.status='failed';assert.equal(applicationRun([fill,prepare],'j').current.status,'failed');});
test('manual sites offer one document review and activity only uses this application',()=>{assert.equal(applicationRun([{...prepare,manualFillRequired:true}],'j').finalReady,true);const rows=runActivity([{jobId:'j',type:'fill',activity:[{at:'2026-10-04T10:00:00Z',message:'Filled name'}]},{jobId:'other',message:'Private other task'},{jobId:'j',type:'prepare',updatedAt:'2026-10-04T09:00:00Z',message:'Prepared'}],'j');assert.deepEqual(rows.map(row=>row.message),['Filled name','Prepared']);});

test('manual tracking offers not applied, applied, failed and in progress with compatible API aliases',()=>{assert.ok(['not_started','in_progress','submitted','failed'].every(id=>applicationStatuses.some(([value])=>value===id)));assert.equal(normalizeApplicationStatus('applied'),'submitted');assert.equal(normalizeApplicationStatus('not_applied'),'not_started');assert.equal(normalizeApplicationStatus('in_progress'),'in_progress');});

test('legacy browser timeout activity hides raw call logs and terminal formatting',()=>{assert.equal(displayTaskMessage('locator.waitFor: Timeout 20000ms exceeded. Call log: [2m waiting for Apply[22m'),'A browser control was unavailable on that screen. Continue processing to resume from the current application step.');assert.equal(displayTaskMessage('Ready to submit'),'Ready to submit');});
test('application presentation follows recorded checkpoints and never implies submission',()=>{
 const tasks=[{...prepare,jobId:'j',review:{approvalStatus:'needs_review'},activity:[{at:'2026-10-10T10:00:00Z',status:'completed',message:'Resume prepared'}]},{id:'f',type:'fill',jobId:'j',parentTaskId:'p',status:'needs_you',stage:'Awaiting your review',message:'Filled known fields',progress:95,finalReviewReady:true,reviewState:{kind:'final_review_required',required:true},activity:[{at:'2026-10-10T10:05:00Z',status:'needs_you',message:'Filled known fields'}]}];
 const model=applicationPresentationModel(tasks,'j');
 assert.deepEqual(model.stages.map(stage=>stage.status),['complete','complete','waiting','waiting']);
 assert.equal(model.current.title,'Final review ready');
 assert.equal(model.submitted,false);
 assert.deepEqual(model.events.map(event=>event.message),['Filled known fields','Resume prepared']);
 assert.equal(applicationPresentationModel(tasks,'other').events.length,0);
});
test('a timestamp without an ATS-confirmed outcome does not display submission as confirmed',()=>{
 const model=applicationPresentationModel([{id:'p',jobId:'j',type:'prepare',hasArtifacts:true},{id:'f',jobId:'j',parentTaskId:'p',type:'fill',status:'completed',submittedAt:'2026-10-14T00:00:00Z'}],'j');
 assert.equal(model.submitted,false);
 assert.equal(applicationStatuses.find(([id])=>id==='unconfirmed')[1],'Submission unconfirmed');
});
