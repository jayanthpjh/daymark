import test from 'node:test';import assert from 'node:assert/strict';
import {workspaceModel} from '../public/application-workspace.js';
const prepare={id:'p',jobId:'j',type:'prepare',hasArtifacts:true,reviewPolicy:'final',review:{approvalStatus:'approved',resume:'Verified resume'}};
const fill={id:'f',jobId:'j',parentTaskId:'p',type:'fill',status:'needs_you',stage:'Needs authentication',reviewState:{kind:'authentication_required'},authStatus:'authentication'};
const state=(f=fill,app)=>({tasks:[f,prepare],applications:app?[app]:[],jobs:[{id:'j',company:'Example',role:'Engineer'}],worker:{status:'ready'}});
test('shows an account checkpoint and never offers final submission before account verification',()=>{
 const m=workspaceModel(state(),'j');assert.equal(m.title,'Sign in to continue');assert.equal(m.tone,'warning');assert.equal(m.canSubmit,false);assert.equal(m.account,'Sign-in required');
});
test('uncertain outcomes suppress retries even with stale final-review flags',()=>{
 const m=workspaceModel(state({...fill,finalReviewReady:true,submitAttemptedAt:'now',submissionOutcome:'uncertain'}),'j');assert.equal(m.title,'Submission unconfirmed');assert.equal(m.canSubmit,false);assert.equal(m.phase,3);
});
test('recorded submission supersedes stale uncertain UI without asserting an ATS receipt',()=>{
 const m=workspaceModel(state({...fill,submissionOutcome:'uncertain',submitAttemptedAt:'now'},{jobId:'j',status:'submitted',manuallyUpdated:true}),'j');assert.equal(m.title,'Recorded as submitted');assert.equal(m.closed,true);assert.equal(m.confirmed,false);assert.equal(m.canRetry,false);
});
test('only ATS confirmation produces confirmed completion',()=>{
 const m=workspaceModel(state({...fill,status:'completed',submissionOutcome:'confirmed'}),'j');assert.equal(m.title,'Application submitted');assert.equal(m.confirmed,true);assert.equal(m.phase,4);
});
test('ready review requires verified account and approved resume before submission action',()=>{
 assert.equal(workspaceModel(state({...fill,authStatus:'authenticated',finalReviewReady:true,reviewState:{kind:'final_review_required'}}),'j').canSubmit,true);
 assert.equal(workspaceModel(state({...fill,finalReviewReady:true}),'j').canSubmit,false);
});

test('preparation remains in progress while the document task is running',()=>{
 const s={...state(),tasks:[{...prepare,status:'running',hasArtifacts:false}]};
 assert.equal(workspaceModel(s,'j').title,'Preparing your resume');
});
test('matched employer mail closes an application whose fill checkpoint is stale',()=>{
 const s=state(fill,{jobId:'j',status:'submitted',manuallyUpdated:false,statusHistory:[{after:'submitted',source:'mail'}]});const m=workspaceModel(s,'j');assert.equal(m.closed,true);assert.equal(m.confirmed,true);assert.equal(m.canSubmit,false);assert.equal(m.canRetry,false);
});
test('unsaved answer or resume edits block the final submission action',()=>{
 const s=state({...fill,authStatus:'authenticated',finalReviewReady:true});s.workspaceDraftDirty=true;
 assert.equal(workspaceModel(s,'j').canSubmit,false);
});
