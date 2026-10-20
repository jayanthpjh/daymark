import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-mail-paused-'));
await fs.writeFile(path.join(directory, 'env'), 'PROTON_BRIDGE_USER=synthetic@example.test\nAPPLICATION_FORWARD_ENABLED=true\nAPPLICATION_FORWARD_TO=synthetic@example.test\n');
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, ['server.mjs'], {
  env: { ...process.env, PORT: String(port), DAYMARK_DATA_DIR: directory, DAYMARK_ENV_PATH: path.join(directory, 'env'), DAYMARK_DISABLE_MAIL_AUTOMATION: 'true', DAYMARK_DISABLE_MAIL_FORWARDING: 'true', DAYMARK_AUTOMATION_DELAY_MS: '3600000' },
  stdio: 'ignore',
});
const request = async (route, options) => fetch(`http://127.0.0.1:${port}${route}`, options);
try {
  let health;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { health = await request('/api/health'); if (health.ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(health?.status, 200, 'API starts while mail is paused');
  const state = await (await request('/api/state')).json();
  assert.equal(state.mailForwarding.enabled, false);
  assert.equal(state.mailForwarding.paused, true);
  const messages = await (await request('/api/proton/messages')).json();
  assert.equal(messages.paused, true);
  assert.deepEqual(messages.messages, []);
  const check = await request('/api/proton/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(check.status, 503);
  assert.equal((await check.json()).paused, true);
  const configure = await request('/api/proton/configure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'synthetic@example.test', password: 'synthetic-password' }) });
  assert.equal(configure.status, 503);
  assert.equal((await configure.json()).saved, false);
  const sync = await request('/api/mailbox/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(sync.status, 503);
  assert.equal((await sync.json()).code, 'integration_paused');
  await assert.rejects(fs.access(path.join(directory, 'worker-control', 'a.sock')));
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
  await fs.rm(directory, { recursive: true, force: true });
}
