import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createPostgresStateStore } from '../postgres-state.mjs';
import { createRedisTaskQueue } from '../redis-task-queue.mjs';

const databaseUrl = process.env.DAYMARK_TEST_DATABASE_URL || '';
const redisUrl = process.env.DAYMARK_TEST_REDIS_URL || '';

test('PostgreSQL checkpoints and Redis single-worker dispatch survive real service calls', { skip: !databaseUrl || !redisUrl }, async () => {
  const dbName = `daymark_test_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.pathname = `/${dbName}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-infra-check-'));
  const legacyFile = path.join(directory, 'state.json');
  const checkpoint = { id: 'checkpoint-integration', step: 'Application questions', url: 'https://jobs.example/apply', questions: [{ id: 'question-1', label: 'Email', value: 'candidate@example.test', selector: 'input[name=email]' }] };
  await fs.writeFile(legacyFile, JSON.stringify({ jobs: [], tasks: [{ id: 'task-integration', type: 'fill', status: 'needs_you', stage: 'Needs your answer', checkpoint }], applications: [], profile: { name: 'Fixture' }, _stateRevision: 3 }));
  let store;
  let redisQueue;
  try {
    store = await createPostgresStateStore({ connectionString: isolatedUrl.toString(), legacyFile });
    const state = await store.read();
    assert.equal(state._stateRevision, 3);
    assert.equal(state.tasks[0].checkpoint.id, checkpoint.id);
    assert.equal((await store.checkpointHistory('task-integration')).length, 1);
    state.tasks[0].checkpoint = { ...checkpoint, questions: [{ ...checkpoint.questions[0], value: 'updated@example.test' }] };
    await store.write(state);
    assert.equal((await store.checkpointHistory('task-integration')).length, 2);

    let resolveTask;
    const seen = new Promise(resolve => { resolveTask = resolve; });
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Redis worker did not receive the task in time.')), 8_000); });
    redisQueue = createRedisTaskQueue({ connectionString: redisUrl, prefix: `daymark-test-${randomUUID()}`, processTask: async taskId => resolveTask(taskId) });
    await redisQueue.waitUntilReady();
    await redisQueue.enqueue('task-integration');
    try { assert.equal(await Promise.race([seen, timeout]), 'task-integration'); }
    finally { clearTimeout(timer); }
  } finally {
    await redisQueue?.close().catch(() => {});
    await store?.close().catch(() => {});
    await fs.rm(directory, { recursive: true, force: true });
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});
