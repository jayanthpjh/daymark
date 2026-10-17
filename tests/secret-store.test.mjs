import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSecretStore, secretBackend, secretFileName } from '../secret-store.mjs';

test('backend defaults to keychain on a Mac and files elsewhere, and honors an explicit choice', () => {
  assert.equal(secretBackend({}, 'darwin'), 'keychain');
  assert.equal(secretBackend({}, 'linux'), 'file');
  assert.equal(secretBackend({ DAYMARK_SECRET_BACKEND: 'file' }, 'darwin'), 'file');
  assert.throws(() => secretBackend({ DAYMARK_SECRET_BACKEND: 'vault' }, 'linux'), /keychain or file/);
});
test('file backend round-trips with owner-only permissions and a safe file name', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-secrets-'));
  try {
    const store = createSecretStore({ backend: 'file', dir });
    assert.equal(await store.get('Daymark Proton Bridge', 'a@pm.me'), '');
    await store.set('Daymark Proton Bridge', 'a@pm.me', 'bridge-pass');
    assert.equal(await store.get('Daymark Proton Bridge', 'a@pm.me'), 'bridge-pass');
    const name = secretFileName('Daymark Proton Bridge', 'a@pm.me');
    assert.equal(name, 'daymark_proton_bridge__a@pm.me');
    assert.equal((await fs.stat(path.join(dir, name))).mode & 0o777, 0o600);
    assert.equal((await fs.readdir(dir)).length, 1, 'no temp file left behind');
    assert.throws(() => secretFileName('../x', ''), /service and an account/);
    assert.ok(!secretFileName('../../etc', 'passwd').includes('/'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('file backend strips one trailing newline from provisioned secrets', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-secrets-'));
  try {
    await fs.writeFile(path.join(dir, secretFileName('svc', 'acct')), 'value\n');
    assert.equal(await createSecretStore({ backend: 'file', dir }).get('svc', 'acct'), 'value');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('keychain backend calls the security tool and treats failures as missing', async () => {
  const calls = [];
  const store = createSecretStore({ backend: 'keychain', exec: async (cmd, args) => { calls.push([cmd, ...args]); if (args[0] === 'find-generic-password') return { stdout: 'pw\n' }; } });
  assert.equal(await store.get('svc', 'acct'), 'pw');
  await store.set('svc', 'acct', 'new');
  assert.deepEqual(calls[1].slice(0, 4), ['security', 'add-generic-password', '-U', '-s']);
  const failing = createSecretStore({ backend: 'keychain', exec: async () => { throw new Error('no item'); } });
  assert.equal(await failing.get('svc', 'acct'), '');
});
