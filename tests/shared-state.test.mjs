import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireFileLock, createSharedJsonStore, mergeStateSnapshots } from '../shared-state.mjs';

test('merges independent task progress and pause updates without changing task or checkpoint contracts', () => {
  const base = { tasks: [{ id: 'task-1', status: 'running', message: 'Filling', checkpoint: { id: 'cp-1', questions: [{ id: 'q-1' }] } }] };
  const worker = structuredClone(base);
  const api = structuredClone(base);
  worker.tasks[0].message = 'Filled profile fields';
  api.tasks[0].status = 'paused';
  api.tasks[0].checkpoint.questions[0].answer = 'Yes';

  const merged = mergeStateSnapshots(base, worker, api);

  assert.deepEqual(merged.tasks[0], {
    id: 'task-1', status: 'paused', message: 'Filled profile fields',
    checkpoint: { id: 'cp-1', questions: [{ id: 'q-1', answer: 'Yes' }] },
  });
});

test('retains activity appended by both API and worker processes', () => {
  const base = { tasks: [{ id: 'task-1', activity: [{ message: 'Queued' }] }] };
  const worker = structuredClone(base);
  const api = structuredClone(base);
  worker.tasks[0].activity.push({ message: 'Browser opened' });
  api.tasks[0].activity.push({ message: 'Paused by you' });

  assert.deepEqual(mergeStateSnapshots(base, worker, api).tasks[0].activity, [
    { message: 'Queued' }, { message: 'Paused by you' }, { message: 'Browser opened' },
  ]);
});

test('serializes writes from separate store instances and merges their independent changes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-state-'));
  const file = path.join(directory, 'state.json');
  const first = createSharedJsonStore(file);
  const second = createSharedJsonStore(file);
  try {
    await first.write({ tasks: [], jobs: [], applications: [], profile: { name: 'Jayanth' } });
    const [firstDraft, secondDraft] = await Promise.all([first.read(), second.read()]);
    firstDraft.tasks.push({ id: 'task-1', status: 'queued' });
    secondDraft.jobs.push({ id: 'job-1', role: 'Engineer' });
    await Promise.all([first.write(firstDraft), second.write(secondDraft)]);

    const result = await first.read();
    assert.equal(result.tasks[0].id, 'task-1');
    assert.equal(result.jobs[0].id, 'job-1');
    assert.equal(result.profile.name, 'Jayanth');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('preserves intentional removal of an unchanged application record', () => {
  const base = { applications: [{ id: 'app-1', jobId: 'job-1', status: 'skipped' }] };
  const draft = { applications: [] };
  const latest = structuredClone(base);

  assert.deepEqual(mergeStateSnapshots(base, draft, latest).applications, []);
});

test('refuses to replace an unreadable state file with a stale draft', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-state-corrupt-'));
  const file = path.join(directory, 'state.json');
  const original = '{"jobs":[{"id":"saved-job"}],';
  const store = createSharedJsonStore(file);
  try {
    await fs.writeFile(file, original, { mode: 0o600 });
    await assert.rejects(store.write({ jobs: [], tasks: [], applications: [], profile: {} }), /cannot safely update unreadable state|invalid structure/i);
    assert.equal(await fs.readFile(file, 'utf8'), original);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('refuses to merge a valid JSON reset object that is missing the saved state collections', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-state-reset-'));
  const file = path.join(directory, 'state.json');
  const store = createSharedJsonStore(file);
  try {
    await store.write({ jobs: [{ id: 'saved-job' }], tasks: [], applications: [], profile: { name: 'Jayanth' } });
    const draft = await store.read();
    draft.tasks.push({ id: 'task-1' });
    const reset = '{\n  "jobs": [],\n  "tasks": []\n}';
    await fs.writeFile(file, reset, { mode: 0o600 });
    await assert.rejects(store.write(draft), /cannot safely update unreadable state/i);
    assert.equal(await fs.readFile(file, 'utf8'), reset);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('refuses a complete-looking empty reset with an older persisted revision', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-state-rollback-'));
  const file = path.join(directory, 'state.json');
  const store = createSharedJsonStore(file);
  try {
    await store.write({ jobs: [{ id: 'saved-job' }], tasks: [{ id: 'saved-task' }], applications: [{ id: 'saved-app' }], profile: { name: 'Jayanth' } });
    const draft = await store.read();
    draft.tasks[0].message = 'Progress';
    const reset = JSON.stringify({ jobs: [], tasks: [], applications: [], profile: { name: '' } });
    await fs.writeFile(file, reset, { mode: 0o600 });
    await assert.rejects(store.read(), /revision moved backwards/i);
    await assert.rejects(store.write(draft), /revision moved backwards|cannot safely update unreadable state/i);
    assert.equal(await fs.readFile(file, 'utf8'), reset);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('refuses to recreate a state file that disappears after a snapshot was read', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-state-missing-'));
  const file = path.join(directory, 'state.json');
  const store = createSharedJsonStore(file);
  try {
    await store.write({ jobs: [{ id: 'saved-job' }], tasks: [], applications: [], profile: {} });
    const draft = await store.read();
    draft.jobs.push({ id: 'new-job' });
    await fs.unlink(file);
    await assert.rejects(store.write(draft), /cannot safely update missing state/i);
    await assert.rejects(fs.access(file));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('keeps committed state intact when abandoned temporary files are present', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-state-temp-'));
  const file = path.join(directory, 'state.json');
  const store = createSharedJsonStore(file);
  try {
    await store.write({ jobs: [{ id: 'committed-job' }], tasks: [], applications: [], profile: {} });
    await fs.writeFile(`${file}.old-process.old-token.tmp`, '{"jobs":[]}', { mode: 0o600 });
    const state = await store.read();
    state.tasks.push({ id: 'new-task' });
    await store.write(state);
    const saved = await store.read();
    assert.deepEqual(saved.jobs.map(job => job.id), ['committed-job']);
    assert.deepEqual(saved.tasks.map(task => task.id), ['new-task']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('refuses writes after a shared-state file lock lease is lost', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-state-lock-lost-'));
  const lockFile = path.join(directory, 'state.lock');
  try {
    const release = await acquireFileLock(lockFile, { staleMs: 1000, heartbeatMs: 10 });
    await fs.writeFile(lockFile, 'other-owner', { mode: 0o600 });
    await assert.rejects(release.assertOwned(), /state lock lease was lost/i);
    await release();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
