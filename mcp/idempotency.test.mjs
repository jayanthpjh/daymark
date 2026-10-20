import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpIdempotency, McpIdempotencyError } from './idempotency.mjs';

function store() {
  const records = new Map(); let tail = Promise.resolve();
  return { records, transaction(fn) { const task = tail.then(() => fn({ get: async (_kind, id) => structuredClone(records.get(id) || null), put: async (_kind, value) => records.set(value.id, structuredClone(value)) })); tail = task.catch(() => {}); return task; } };
}
const base = { key: 'request_0123456789', operation: 'prepare', input: { jobId: 'job-1', sourceVersion: '7' } };

test('durable idempotency returns the first result and never repeats execution', async () => {
  const saved = store(), idempotency = createMcpIdempotency({ store: saved }); let calls = 0;
  const first = await idempotency.run({ ...base, execute: async () => { calls++; return { status: 'queued', taskId: 'task-1' }; } });
  const retry = await idempotency.run({ ...base, execute: async () => { calls++; return { taskId: 'task-2' }; } });
  assert.deepEqual(retry, first); assert.equal(calls, 1); assert.equal(saved.records.get(base.key).status, 'completed');
});

test('same key with different arguments conflicts and concurrent retries do not queue twice', async () => {
  const idempotency = createMcpIdempotency({ store: store() }); let calls = 0; let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const first = idempotency.run({ ...base, execute: async () => { calls++; await barrier; return { status: 'queued', taskId: 'task-1' }; } });
  await new Promise(resolve => setImmediate(resolve));
  const second = await idempotency.run({ ...base, execute: async () => { calls++; return {}; } });
  assert.deepEqual(second, { status: 'in_progress' });
  await assert.rejects(idempotency.run({ ...base, input: { jobId: 'other', sourceVersion: '7' }, execute: async () => ({}) }), error => error instanceof McpIdempotencyError && error.code === 'key_reused');
  release(); await first; assert.equal(calls, 1);
});

test('failed requests remain failed after a retry so uncertain side effects are not duplicated', async () => {
  const idempotency = createMcpIdempotency({ store: store() }); let calls = 0;
  const first = await idempotency.run({ ...base, execute: async () => { calls++; throw Error('private local path'); } });
  const retry = await idempotency.run({ ...base, execute: async () => { calls++; return {}; } });
  assert.equal(first.status, 'failed'); assert.deepEqual(retry, first); assert.equal(calls, 1); assert.equal(JSON.stringify(retry).includes('private local path'), false);
});
