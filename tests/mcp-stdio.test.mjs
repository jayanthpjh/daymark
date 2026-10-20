import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('stdio MCP negotiates, lists bounded tools, and serves a read without leaking private state', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-mcp-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ jobs: [{ id: 'j1', company: 'Example', role: 'Engineer', description: 'private job description' }], tasks: [{ id: 't1', jobId: 'j1', type: 'prepare', status: 'needs_you', stage: 'resume', artifacts: { resume: 'private resume', resumePdf: '/private/resume.pdf' } }], applications: [], profile: {} }));
  const emptyEnv = path.join(dir, '.env'); await fs.writeFile(emptyEnv, '');
  const child = spawn(process.execPath, ['mcp/read-stdio.mjs'], { cwd: process.cwd(), env: { ...process.env, DAYMARK_DATA_DIR: dir, DAYMARK_ENV_PATH: emptyEnv, DAYMARK_DATABASE_URL: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGTERM'));
  let buffer = '';
  const waiting = new Map();
  let id = 0;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const index = buffer.indexOf('\n'); if (index < 0) break;
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) { const resolve = waiting.get(message.id); waiting.delete(message.id); resolve?.(message); }
    }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { waiting.delete(requestId); reject(new Error(`Timed out waiting for ${method}`)); }, 5000);
    waiting.set(requestId, message => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
  });
  const initResponse = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out initializing MCP server')), 5000);
    waiting.set(1, message => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'daymark-test', version: '1' } } })}\n`);
  });
  assert.ok(initResponse.result?.protocolVersion);
  id = 1;
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  const listed = await request('tools/list');
  assert.deepEqual(listed.result.tools.map(tool => tool.name), ['daymark_find_jobs', 'daymark_application_status', 'daymark_pending_questions', 'daymark_tracker_page', 'daymark_add_job_link', 'daymark_prepare_application', 'daymark_request_application_fill', 'daymark_draft_question_answer']);
  const called = await request('tools/call', { name: 'daymark_find_jobs', arguments: { query: 'example' } });
  const serialized = JSON.stringify(called.result);
  assert.match(serialized, /Example/);
  for (const privateValue of ['private job description', 'private resume', '/private/resume.pdf']) assert.equal(serialized.includes(privateValue), false);
  assert.equal(child.exitCode, null);
});
