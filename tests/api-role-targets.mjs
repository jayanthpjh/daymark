import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-role-targets-'));
await fs.writeFile(path.join(dir, 'env'), '');
await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ profile: { name: 'Alex', roleSearch: 'Data Engineer', resumeText: 'private resume', skills: 'Python' }, jobs: [], tasks: [], applications: [] }));
const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DAYMARK_DATA_DIR: dir, DAYMARK_ENV_PATH: path.join(dir, 'env'), DAYMARK_DISABLE_MAIL_AUTOMATION: 'true' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
const request = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  let response = await request('/api/profile/role-targets', { roleSearch: 'Data Engineer; Analytics Architect', roleFamilies: ['software-engineering', 'data-science-ml'] });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.profile.roleSearch, 'Data Engineer; Analytics Architect');
  assert.deepEqual(saved.profile.roleFamilies, ['software-engineering', 'data-science-ml']);
  assert.equal(saved.profile.resumeText, '[saved locally]');
  const stored = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).profile;
  assert.equal(stored.name, 'Alex', 'target save leaves unrelated profile data untouched');
  assert.equal(stored.skills, 'Python');
  assert.equal(stored.resumeText, 'private resume');
  assert.equal((await request('/api/profile/role-targets', { roleSearch: 'Engineer', roleFamilies: ['made-up'] })).status, 400);
  console.log('PASS: role targets save validated title/family choices without rewriting unrelated profile data or exposing resume text.');
} finally {
  child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); await fs.rm(dir, { recursive: true, force: true });
}
