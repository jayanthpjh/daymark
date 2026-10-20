import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionTaskGate } from '../collection-task-gate.mjs';

test('simultaneous collection requests create one task and share its active task', async () => {
  const state = { tasks: [] };
  let sequence = 0;
  const gate = createCollectionTaskGate({
    readState: async () => structuredClone(state),
    createTask: async (type, values) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const task = { id: `task-${++sequence}`, type, ...values, status: 'queued' };
      state.tasks.unshift(task);
      return task;
    },
  });

  const [first, second] = await Promise.all([
    gate({ source: 'ats' }),
    gate({ source: 'ats' }),
  ]);

  assert.equal(sequence, 1);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.task.id, second.task.id);
});

test('collection gate can decline a scheduled run when it is no longer due', async () => {
  let created = false;
  const gate = createCollectionTaskGate({
    readState: async () => ({ tasks: [] }),
    createTask: async () => { created = true; return { id: 'unexpected' }; },
  });

  const result = await gate({ source: 'ats', scheduled: true }, async () => false);

  assert.equal(created, false);
  assert.equal(result.task, null);
  assert.equal(result.created, false);
});
