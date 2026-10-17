import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPostgresStateStore } from '../postgres-state.mjs';

class PoolMock {
  state = null;
  checkpoints = new Map();
  history = new Map();
  async query(sql, values = []) {
    sql = sql.trimStart();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
    if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT 1 FROM daymark_state')) return { rows: this.state ? [{ '?column?': 1 }] : [], rowCount: this.state ? 1 : 0 };
    if (sql.includes('SELECT state_json, revision FROM daymark_state')) return { rows: this.state ? [{ ...this.state }] : [], rowCount: this.state ? 1 : 0 };
    if (sql.includes('INSERT INTO daymark_state')) {
      if (!this.state || sql.includes('ON CONFLICT (state_id) DO UPDATE')) this.state = { state_json: JSON.parse(values[2]), revision: Number(values[1]) };
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO daymark_application_checkpoints')) {
      for (const record of JSON.parse(values[0])) this.checkpoints.set(record.task_id, record);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO daymark_checkpoint_history')) {
      for (const record of JSON.parse(values[0])) this.history.set(record.event_id, { ...record, created_at: new Date().toISOString() });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT checkpoint_id, state_revision, checkpoint_json')) {
      return { rows: [...this.history.values()].filter(row => row.task_id === values[0]).slice(0, values[1]), rowCount: this.history.size };
    }
    throw new Error(`Unexpected SQL in test fake: ${sql.slice(0, 80)}`);
  }
  async connect() {
    return { query: (...args) => this.query(...args), release() {} };
  }
  async end() {}
}

const initial = () => ({ jobs: [], tasks: [], applications: [], profile: { name: 'Jayanth' } });

test('persists the existing state contract and mirrors private task checkpoints transactionally', async () => {
  const pool = new PoolMock();
  const store = await createPostgresStateStore({ pool });
  await assert.rejects(store.read(), { code: 'ENOENT' });
  const state = initial();
  state.tasks.push({ id: 'fill-1', type: 'fill', status: 'needs_you', stage: 'Needs your answer', checkpoint: { id: 'cp-1', step: 'Questions', questions: [{ id: 'q-1', selector: 'input[name=email]', label: 'Email' }] } });
  await store.write(state);
  const loaded = await store.read();
  assert.equal(loaded.profile.name, 'Jayanth');
  assert.equal(loaded.tasks[0].checkpoint.id, 'cp-1');
  assert.equal(pool.checkpoints.get('fill-1').checkpoint_json.questions[0].selector, 'input[name=email]');
  assert.equal((await store.checkpointHistory('fill-1')).length, 1);
  await store.close();
});

test('imports the legacy JSON document only into an empty database', async () => {
  const pool = new PoolMock();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-postgres-state-'));
  const file = path.join(directory, 'state.json');
  await fs.writeFile(file, JSON.stringify({ ...initial(), _stateRevision: 4 }));
  try {
    const store = await createPostgresStateStore({ pool, legacyFile: file });
    assert.equal((await store.read()).profile.name, 'Jayanth');
    assert.equal(pool.state.revision, 4);
    await store.close();
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('merges concurrent API and worker snapshots without discarding unrelated task changes', async () => {
  const pool = new PoolMock();
  const store = await createPostgresStateStore({ pool });
  const base = initial();
  base.tasks.push({ id: 'fill-a', type: 'fill', status: 'queued' }, { id: 'fill-b', type: 'fill', status: 'queued' });
  await store.write(base);
  const apiSnapshot = await store.read();
  const workerSnapshot = await store.read();
  apiSnapshot.tasks[0].status = 'running';
  workerSnapshot.tasks[1].status = 'needs_you';
  await Promise.all([store.write(apiSnapshot), store.write(workerSnapshot)]);
  const latest = await store.read();
  assert.equal(latest.tasks.find(task => task.id === 'fill-a').status, 'running');
  assert.equal(latest.tasks.find(task => task.id === 'fill-b').status, 'needs_you');
  await store.close();
});

test('idle database disconnects are handled and later reads recover without replacing saved state',async()=>{
 const {EventEmitter}=await import('node:events');
 const pool=new PoolMock();const emitter=new EventEmitter();pool.on=emitter.on.bind(emitter);
 const store=await createPostgresStateStore({pool});
 await store.write(initial());
 assert.doesNotThrow(()=>emitter.emit('error',new Error('connection lost')));
 assert.equal((await store.read()).profile.name,'Jayanth');
 await store.close();
});
