import test from 'node:test';
import assert from 'node:assert/strict';
import { canApplyCheckpointAnswers } from '../task-answers.mjs';

test('checkpoint answers can be applied to the same visible manual-handoff session', () => {
  const task = { id: 'fill-1', status: 'needs_you', manualHandoff: true };
  assert.equal(canApplyCheckpointAnswers(task, 'fill-1'), true);
  assert.equal(canApplyCheckpointAnswers(task, null), true);
  assert.equal(canApplyCheckpointAnswers(task, 'other'), false);
  assert.equal(canApplyCheckpointAnswers({ ...task, status: 'running' }, 'fill-1'), false);
  assert.equal(canApplyCheckpointAnswers({ ...task, manualHandoff: false }, 'fill-1'), false);
});
