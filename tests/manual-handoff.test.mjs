import test from 'node:test';
import assert from 'node:assert/strict';
import { parkManualHandoff } from '../manual-handoff.mjs';
import { resolutionPanel } from '../public/application-questions.js';

test('parking a manual checkpoint releases browser ownership and preserves recovery state', () => {
  const checkpoint = { id: 'checkpoint-1', url: 'https://jobs.example/apply', pauseReason: 'verification', questions: [] };
  const formSnapshot = { url: checkpoint.url, fields: ['email'] };
  const task = { id: 'banner-fill', type: 'fill', status: 'needs_you', manualHandoff: true, watchBrowser: true, checkpoint, formSnapshot, submitAttemptedAt: '2026-10-08T12:00:00.000Z', activity: [] };

  const parked = parkManualHandoff(task, { now: '2026-10-08T13:00:00.000Z' });

  assert.equal(parked.status, 'needs_you');
  assert.equal(parked.manualHandoff, false);
  assert.equal(parked.watchBrowser, false);
  assert.equal(parked.checkpoint, checkpoint);
  assert.equal(parked.formSnapshot, formSnapshot);
  assert.equal(parked.submitAttemptedAt, task.submitAttemptedAt);
  assert.match(parked.message, /checkpoint is saved/);
  assert.equal(parked.activity.length, 1);
});

test('refuses to park a running task or a task without a recoverable browser checkpoint', () => {
  assert.equal(parkManualHandoff({ type: 'fill', status: 'running', manualHandoff: true }), null);
  assert.equal(parkManualHandoff({ type: 'fill', status: 'needs_you' }), null);
  assert.equal(parkManualHandoff({ type: 'prepare', status: 'needs_you', manualHandoff: true }), null);
});

test('shows the park action for a saved user checkpoint and omits it while processing is running', () => {
  const checkpointTask = { id: 'fill-1', type: 'fill', status: 'needs_you', checkpoint: { step: 'Verification', capturedAt: '2026-10-08T12:00:00.000Z', pauseReason: 'verification' } };
  const html = resolutionPanel(checkpointTask, 'https://jobs.example/apply', { mode: 'container', status: 'ready' });
  assert.match(html, /data-park-task="fill-1"/);
  assert.match(html, /Unsaved employer fields may need to be entered again/);
  assert.doesNotMatch(resolutionPanel({ ...checkpointTask, status: 'running' }, '', {}), /data-park-task/);
});
