import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuthMailGateway, requestAuthMail } from '../auth-mail-gateway.mjs';

test('passes only a scoped one-time code over a local socket and never logs mailbox content', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-auth-mail-'));
  const socketPath = path.join(dir, 'worker-control', 'auth.sock');
  const gateway = await createAuthMailGateway({ socketPath, findMail: async request => ({ id: 'mail-1', code: request.taskId === 'fill-1' ? '123456' : '' }) });
  try {
    const result = await requestAuthMail({ socketPath, taskId: 'fill-1', purpose: 'verify', since: Date.now() - 1000, usedIds: [] });
    assert.deepEqual(result, { id: 'mail-1', code: '123456' });
    assert.equal(await requestAuthMail({ socketPath, taskId: 'fill-1', purpose: 'reset', since: Date.now(), usedIds: [] }), null);
  } finally {
    await gateway.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rejects malformed and stale mailbox requests before opening the local socket', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-auth-mail-'));
  const socketPath = path.join(dir, 'auth.sock');
  let calls = 0;
  const gateway = await createAuthMailGateway({ socketPath, findMail: async () => { calls += 1; return { id: 'x', code: '654321' }; } });
  try {
    assert.equal(await requestAuthMail({ socketPath, taskId: 'invalid id', purpose: 'verify', since: 0, usedIds: [] }), null);
    assert.equal(await requestAuthMail({ socketPath, taskId: 'fill-1', purpose: 'verify', since: 0, usedIds: [] }), null);
    assert.equal(calls, 0);
  } finally {
    await gateway.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('security-purpose requests carry alphanumeric codes while verify requests stay numeric', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-auth-mail-'));
  const socketPath = path.join(dir, 'auth.sock');
  const gateway = await createAuthMailGateway({ socketPath, findMail: async () => ({ id: 'mail-2', code: 'aB3dE5gH' }) });
  try {
    assert.deepEqual(await requestAuthMail({ socketPath, taskId: 'fill-1', purpose: 'security', since: Date.now() - 1000, usedIds: [] }), { id: 'mail-2', code: 'aB3dE5gH' });
    assert.equal(await requestAuthMail({ socketPath, taskId: 'fill-1', purpose: 'verify', since: Date.now() - 1000, usedIds: [] }), null);
  } finally {
    await gateway.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
