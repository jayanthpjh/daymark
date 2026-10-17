import test from 'node:test';
import assert from 'node:assert/strict';
import { taskWatchdogDecision, workerStallDecision } from '../task-watchdog.mjs';

test('worker progress watchdog ignores idle, fresh, and untracked work', () => {
  assert.equal(workerStallDecision({ activeTaskId: '', lastProgressAt: 1_000 }, { now: 400_000 }), null);
  assert.equal(workerStallDecision({ activeTaskId: 'task-a', lastProgressAt: 100_000 }, { now: 399_999 }), null);
  assert.equal(workerStallDecision({ activeTaskId: 'task-a', lastProgressAt: 0 }, { now: 400_000 }), null);
});

test('stalled worker exits for container restart after preserving the latest checkpoint', () => {
  const decision = workerStallDecision({ activeTaskId: 'task-a', lastProgressAt: 100_000 }, { now: 400_001 });
  assert.equal(decision.action, 'restart_worker');
  assert.equal(decision.taskId, 'task-a');
  assert.equal(decision.stalledForMs, 300_001);
});

test('ignores completed tasks and tasks with a fresh worker heartbeat', () => {
  const task = { id: 'task-a', status: 'running', updatedAt: new Date(0).toISOString() };
  assert.equal(taskWatchdogDecision({ ...task, status: 'completed' }, null, { now: 100_000 }), null);
  assert.equal(taskWatchdogDecision(task, { heartbeatAt: 99_000, activeTaskId: 'task-a' }, { now: 100_000 }), null);
});

test('moves an abandoned task to an explicit recovery checkpoint without retrying it', () => {
  const task = { id: 'task-a', status: 'running', updatedAt: new Date(1_000).toISOString() };
  const decision = taskWatchdogDecision(task, { heartbeatAt: 1_000, activeTaskId: 'task-a' }, { now: 30_000 });
  assert.equal(decision.status, 'needs_you');
  assert.equal(decision.recoveryReason, 'worker_lost');
  assert.equal(decision.reviewState.kind, 'verification_required');
  assert.doesNotMatch(decision.message, /retry automatically/i);
});

test('never replays an uncertain submit after the worker disappears', () => {
  const decision = taskWatchdogDecision({ id: 'task-a', status: 'running', updatedAt: new Date(1_000).toISOString(), submitAttemptedAt: '2026-10-07T12:00:00Z' }, { heartbeatAt: 1_000, activeTaskId: 'task-a' }, { now: 30_000 });
  assert.equal(decision.submissionOutcome, 'uncertain');
  assert.equal(decision.submitRequested, false);
  assert.equal(decision.reviewState.kind, 'submission_confirmation_required');
});
