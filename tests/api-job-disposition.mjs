import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-job-disposition-'));
await fs.mkdir(path.join(dir, 'files'));
await fs.writeFile(path.join(dir, 'env'), '');
await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ profile: {}, onboarding: {}, jobs: [{ id: 'job-a', company: 'Example', role: 'Engineer' }], tasks: [], applications: [] }));
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DAYMARK_DATA_DIR: dir, DAYMARK_ENV_PATH: path.join(dir, 'env'), DAYMARK_DISABLE_MAIL_AUTOMATION: 'true' }, stdio: 'ignore' });
const exited = new Promise(resolve => child.once('exit', resolve));
const base = `http://127.0.0.1:${port}`;
const request = async (route, method = 'GET', body, headers = {}) => fetch(base + route, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
try {
  for (let i = 0; i < 100; i++) { try { if ((await request('/api/health')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  let response = await request('/api/state');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).jobDispositions, {});

  response = await request('/api/jobs/job-a/disposition', 'PUT', { status: 'saved' }, { origin: base });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { jobId: 'job-a', status: 'saved' });
  const storedSaved = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).jobDispositions;
  assert.deepEqual(storedSaved, { 'job-a': 'saved' });
  response = await request('/api/jobs/job-a/disposition', 'PUT', { status: 'saved' }, { origin: base });
  assert.equal(response.status, 200, 'repeating a disposition is safe');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).jobDispositions, storedSaved);
  response = await request('/api/state');
  assert.deepEqual((await response.json()).jobDispositions, { 'job-a': 'saved' });

  response = await request('/api/jobs/job-a/disposition', 'PUT', { status: 'passed' }, { origin: base });
  assert.equal(response.status, 200);
  response = await request('/api/jobs/job-a/disposition', 'PUT', { status: 'active' }, { origin: base });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).jobDispositions, {});

  assert.equal((await request('/api/jobs/missing/disposition', 'PUT', { status: 'saved' }, { origin: base })).status, 404);
  assert.equal((await request('/api/jobs/job-a/disposition', 'PUT', { status: 'deleted' }, { origin: base })).status, 400);
  assert.equal((await request('/api/jobs/job-a/disposition', 'PUT', { status: 'passed' }, { origin: 'https://other.example' })).status, 403);
  console.log('PASS: job dispositions persist independently, expose only saved/passed state, and support idempotent save/pass/restore');
} finally {
  child.kill('SIGTERM');
  await exited;
  await fs.rm(dir, { recursive: true, force: true });
}
