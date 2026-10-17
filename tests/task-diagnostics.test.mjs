import test from 'node:test';import assert from 'node:assert/strict';
import {taskDiagnostics} from '../task-diagnostics.mjs';
import {applicationOrchestrationState} from '../application-orchestrator.mjs';
test('distinguishes dispatch from an attempted submit waiting for receipt',()=>{
 assert.equal(applicationOrchestrationState({type:'fill',status:'queued',submitRequested:true}),'submission_queued');
 assert.equal(applicationOrchestrationState({type:'fill',status:'running',submitAttemptedAt:'now'}),'awaiting_confirmation');
});
test('exposes safe timings and blocker without credentials, answers, urls or selectors',()=>{
 const d=taskDiagnostics({id:'t',type:'fill',status:'needs_you',createdAt:'2026-10-14T10:00:00Z',updatedAt:'2026-10-14T10:00:30Z',checkpoint:{pauseReason:'authentication',questions:[{value:'secret'}]},pendingAnswers:{pw:'secret'},orchestration:{state:'authenticating',updatedAt:'2026-10-14T10:00:20Z',history:[{revision:1,state:'reading_form',worker:'browser',at:'2026-10-14T10:00:00Z',message:'secret'},{revision:2,state:'authenticating',worker:'browser',at:'2026-10-14T10:00:20Z'}]}},{now:Date.parse('2026-10-14T10:01:00Z')});
 assert.equal(d.elapsedMs,60000);assert.equal(d.phaseAgeMs,40000);assert.equal(d.timeline[0].durationMs,20000);assert.equal(d.blockedBy,'authentication');assert.equal(JSON.stringify(d).includes('secret'),false);
});
test('uncertain submission never advises an automatic retry',()=>{
 assert.equal(taskDiagnostics({type:'fill',status:'failed',submitAttemptedAt:'now'}).retryAllowed,false);
 assert.equal(taskDiagnostics({type:'fill',status:'needs_you',recoveryReason:'navigation_failed'}).retryAllowed,true);
});
test('terminal task timing stops while pending checkpoints are labelled waiting',()=>{
 const now=Date.parse('2026-10-14T12:00:00Z');
 const d=taskDiagnostics({status:'completed',createdAt:'2026-10-14T10:00:00Z',updatedAt:'2026-10-14T10:01:00Z',orchestration:{updatedAt:'2026-10-14T10:01:00Z',history:[{state:'submitted',at:'2026-10-14T10:01:00Z'}]}},{now});
 assert.equal(d.elapsedMs,60000);assert.equal(d.phaseAgeMs,0);assert.equal(d.timeline[0].durationMs,0);assert.equal(d.timingKind,'finished');
 assert.equal(taskDiagnostics({status:'needs_you'}).timingKind,'waiting');
});
