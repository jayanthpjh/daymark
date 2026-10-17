import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function startServer(role, dataDir, apiPort, workerPort) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      DAYMARK_ROLE: role,
      DAYMARK_DATA_DIR: dataDir,
      DAYMARK_ENV_PATH: path.join(dataDir, 'missing.env'),
      DAYMARK_AUTOMATION_DELAY_MS: '3600000',
      PORT: String(apiPort),
      DAYMARK_WORKER_PORT: String(workerPort),
      PLAYWRIGHT_BROWSERS_PATH: process.env.DAYMARK_TEST_BROWSER_PATH || path.join(root, 'data/browser-runtime'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  return { child, get output() { return output; } };
}

async function waitFor(testFn, { timeoutMs = 8_000 } = {}) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try { const value = await testFn(); if (value) return value; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw lastError || new Error('Server did not become ready in time.');
}

async function stop(proc) {
  if (proc.child.exitCode !== null) return;
  proc.child.kill('SIGTERM');
  let timer;
  try {
    await Promise.race([
      new Promise(resolve => proc.child.once('exit', resolve)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Daymark test server did not stop.')), 12_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

test('split API and worker retain local boundaries, expose a minimal heartbeat, and enforce one queue owner', { skip: !process.env.DAYMARK_TEST_API_PORT || !process.env.DAYMARK_TEST_WORKER_PORT || !process.env.DAYMARK_TEST_DUPLICATE_PORT }, async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-worker-process-'));
  const apiPort = Number(process.env.DAYMARK_TEST_API_PORT);
  const workerPort = Number(process.env.DAYMARK_TEST_WORKER_PORT);
  const duplicatePort = Number(process.env.DAYMARK_TEST_DUPLICATE_PORT);
  assert.equal(new Set([apiPort, workerPort, duplicatePort]).size, 3, 'test ports must be distinct');
  const api = startServer('api', dataDir, apiPort, workerPort);
  let worker;
  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok);
    worker = startServer('worker', dataDir, apiPort, workerPort);
    const workerHealth=await waitFor(async () => {
      if (worker.child.exitCode !== null) throw new Error(worker.output || 'Worker exited before starting.');
      try { const response=await fetch(`http://127.0.0.1:${workerPort}/_worker/health`);return response.status===200||response.status===503?{response,body:await response.json()}:null; }
      catch (error) { throw new Error(`${error.message}${worker.output ? ` · ${worker.output}` : ''}`); }
    });

    const state = await waitFor(async () => {
      if (api.child.exitCode !== null) throw new Error(api.output || `API exited with code ${api.child.exitCode}.`);
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/state`);
      const value = await response.json();
      return value.worker.status === 'offline' || value.worker.status === 'ready' ? value : null;
    });
    assert.equal(state.worker.mode, 'container');
    assert.equal(workerHealth.body.browser, workerHealth.response.status===200?'ready':'starting');
    assert.equal(state.worker.status, workerHealth.response.status===200?'ready':'offline');
    assert.equal(state.worker.viewerUrl, workerHealth.response.status===200?'http://127.0.0.1:6080/vnc.html?autoconnect=1':'');

    const hiddenApi = await fetch(`http://127.0.0.1:${workerPort}/api/state`);
    assert.equal(hiddenApi.status, 404);

    const duplicate = startServer('worker', dataDir, apiPort, duplicatePort);
    const duplicateExit = await new Promise(resolve => duplicate.child.once('exit', code => resolve(code)));
    assert.equal(duplicateExit, 1);
    assert.match(duplicate.output, /Another Daymark worker is already using this data folder/);

    await stop(worker);
    worker = null;
    const offlineState = await (await fetch(`http://127.0.0.1:${apiPort}/api/state`)).json();
    assert.equal(offlineState.worker.status, 'offline');
    assert.equal(offlineState.worker.viewerUrl, '');
  } finally {
    if (worker) await stop(worker).catch(() => {});
    await stop(api).catch(() => {});
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
