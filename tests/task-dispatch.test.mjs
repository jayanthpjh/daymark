import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRunnableTask } from '../task-dispatch.mjs';

test('an application can start while a collection is already running', () => {
  const tasks = [
    { id: 'new-collect', type: 'collect', status: 'queued' },
    { id: 'apply', type: 'prepare', status: 'queued' },
  ];
  assert.equal(nextRunnableTask(tasks, { activeTasks: 1, applicationActive: false, collectionActive: true })?.id, 'apply');
});

test('only one application task is scheduled at a time, while collection can use the other slot', () => {
  const tasks = [
    { id: 'second-apply', type: 'fill', status: 'queued' },
    { id: 'collect', type: 'collect', status: 'queued' },
  ];
  assert.equal(nextRunnableTask(tasks, { activeTasks: 1, applicationActive: true, collectionActive: false })?.id, 'collect');
  assert.equal(nextRunnableTask(tasks, { activeTasks: 2, applicationActive: true, collectionActive: true }), null);
});

test('application work has priority over queued collection work', () => {
  const tasks = [
    { id: 'collect', type: 'collect', status: 'queued' },
    { id: 'prepare', type: 'prepare', status: 'queued' },
  ];
  assert.equal(nextRunnableTask(tasks, { activeTasks: 0 })?.id, 'prepare');
});

test('does not schedule terminal or already-running tasks', () => {
  assert.equal(nextRunnableTask([
    { id: 'done', type: 'prepare', status: 'completed' },
    { id: 'active', type: 'collect', status: 'running' },
  ]), null);
});
