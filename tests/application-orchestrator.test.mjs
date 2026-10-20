import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationOrchestrationState, preparationReadyMessage, syncApplicationOrchestration } from '../application-orchestrator.mjs';

test('says filling is paused when preparation was queued without autofill', () => {
  assert.equal(preparationReadyMessage({ reviewPolicy: 'final', autoFill: false }), 'Tailored documents are ready for your review. Browser filling is paused.');
});

test('keeps the filling notice when autofill is enabled', () => {
  assert.equal(preparationReadyMessage({ reviewPolicy: 'final', autoFill: true }), 'Tailored documents prepared. Filling continues before your final review.');
});

test('maps existing preparation and fill task stages to durable orchestration states', () => {
  assert.equal(applicationOrchestrationState({ type: 'prepare', status: 'running' }), 'preparing_documents');
  assert.equal(applicationOrchestrationState({ type: 'prepare', status: 'ready_for_review' }), 'documents_ready');
  assert.equal(applicationOrchestrationState({ type: 'fill', status: 'running', stage: 'Reading application form' }), 'reading_form');
  assert.equal(applicationOrchestrationState({ type: 'fill', status: 'needs_you', finalReviewReady: true }), 'final_review');
  assert.equal(applicationOrchestrationState({ type: 'fill', status: 'needs_you', checkpoint: { pauseReason: 'answers' } }), 'needs_user_answer');
});

test('records only state changes, increments revisions, and keeps safe checkpoint history', () => {
  const task = { id: 'fill-1', type: 'fill', parentTaskId: 'prepare-1', status: 'queued', stage: 'Queued' };
  syncApplicationOrchestration(task, { now: '2026-10-12T10:00:00.000Z' });
  syncApplicationOrchestration(task, { now: '2026-10-12T10:00:01.000Z' });
  assert.equal(task.orchestration.state, 'waiting_for_browser');
  assert.equal(task.orchestration.revision, 1);
  task.status = 'needs_you';
  task.finalReviewReady = true;
  task.checkpoint = { id: 'cp-1', step: 'Review', selector: '#private', url: 'https://jobs.example/app?token=secret' };
  syncApplicationOrchestration(task, { now: '2026-10-12T10:00:02.000Z' });
  assert.equal(task.orchestration.state, 'final_review');
  assert.equal(task.orchestration.worker, 'dialogue');
  assert.equal(task.orchestration.revision, 2);
  assert.equal(task.orchestration.history[1].checkpointId, 'cp-1');
  assert.equal(task.orchestration.history[1].event, 'FinalReviewReady');
  assert.equal(JSON.stringify(task.orchestration).includes('secret'), false);
  assert.equal(JSON.stringify(task.orchestration).includes('#private'), false);
});

test('preserves confirmed submissions as terminal orchestration state', () => {
  const task = { id: 'fill-2', type: 'fill', status: 'completed', submissionOutcome: 'confirmed' };
  syncApplicationOrchestration(task);
  task.status = 'queued';
  syncApplicationOrchestration(task);
  assert.equal(task.orchestration.state, 'submitted');
});

test('advances the checkpoint revision even when the pause state is unchanged', () => {
  const task = { id: 'fill-3', type: 'fill', status: 'needs_you', stage: 'Needs your answer', checkpoint: { id: 'cp-1', pauseReason: 'answers' } };
  syncApplicationOrchestration(task);
  task.checkpoint = { id: 'cp-2', pauseReason: 'answers' };
  syncApplicationOrchestration(task);
  assert.equal(task.orchestration.state, 'needs_user_answer');
  assert.equal(task.orchestration.revision, 2);
  assert.equal(task.orchestration.checkpointId, 'cp-2');
});

test('separates a confirmed submit request from final review', () => {
  const task = { id: 'fill-4', type: 'fill', status: 'queued', finalReviewReady: true, submitRequested: true };
  assert.equal(applicationOrchestrationState(task), 'submission_queued');
});

test('confirmed ATS receipt supersedes an older uncertain checkpoint',()=>{
 assert.equal(applicationOrchestrationState({type:'fill',status:'completed',submissionOutcome:'confirmed',checkpoint:{pauseReason:'submission_uncertain'}}),'submitted');
});
