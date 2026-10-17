import test from 'node:test';
import assert from 'node:assert/strict';
import { readStateOrInitialize } from '../state-recovery.mjs';

test('initializes state only when the saved state file is missing', async () => {
  const initial = { jobs: [], tasks: [] };
  let saved;

  const result = await readStateOrInitialize(
    async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    async value => { saved = structuredClone(value); },
    () => initial,
  );

  assert.deepEqual(result, initial);
  assert.deepEqual(saved, initial);
});

test('preserves saved data when state reading fails for reasons other than a missing file', async () => {
  let writes = 0;

  await assert.rejects(
    readStateOrInitialize(
      async () => { throw new SyntaxError('invalid state JSON'); },
      async () => { writes += 1; },
      () => ({ jobs: [], tasks: [] }),
    ),
    SyntaxError,
  );

  assert.equal(writes, 0);
});

test('uses state created by another process when initialization loses the race', async () => {
  const committed = { jobs: [{ id: 'saved-job' }], tasks: [] };
  let reads = 0;
  const result = await readStateOrInitialize(
    async () => {
      reads += 1;
      if (reads === 1) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(committed);
    },
    async () => { throw new Error('state changed during initialization'); },
    () => ({ jobs: [], tasks: [] }),
  );

  assert.deepEqual(result, committed);
});
