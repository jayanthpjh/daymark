import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentReadTools } from '../agent-read-tools.mjs';
import { createMcpReadInterface } from './read-interface.mjs';

const state = {
  jobs: [{ id: 'j1', company: 'Example', role: 'Engineer', description: 'private description' }],
  tasks: [
    { id: 't1', jobId: 'j1', type: 'prepare', status: 'needs_you', stage: 'resume', updatedAt: '2026-10-17T12:00:00.000Z', artifacts: { resume: 'private resume', resumePdf: '/private/resume.pdf' }, reviewState: { kind: 'resume' } },
    { id: 't2', jobId: 'j1', type: 'fill', status: 'needs_you', stage: 'questions', createdAt: '2026-10-16T12:00:00.000Z', checkpoint: { answer: 'private answer', code: '123456' } },
  ],
};
const make = () => createMcpReadInterface(createAgentReadTools(async () => structuredClone(state)));

test('MCP reads expose only bounded job and application metadata', async () => {
  const mcp = make();
  assert.equal(mcp.tools.length, 4);
  const jobs = (await mcp.call('daymark_find_jobs', { query: 'example' })).structuredContent;
  assert.deepEqual(jobs.jobs, [{ id: 'j1', company: 'Example', role: 'Engineer' }]);
  const tracker = (await mcp.call('daymark_tracker_page', { limit: 1 })).structuredContent;
  assert.equal(tracker.applications.length, 1);
  assert.equal(tracker.applications[0].taskId, 't1');
  assert.equal(tracker.nextCursor, '1');
  const second = (await mcp.call('daymark_tracker_page', { cursor: tracker.nextCursor })).structuredContent;
  assert.equal(second.applications[0].taskId, 't2');
  assert.equal(second.nextCursor, null);
  for (const result of [jobs, tracker, second, (await mcp.call('daymark_pending_questions')).structuredContent, (await mcp.call('daymark_application_status', { jobId: 'j1' })).structuredContent]) {
    const serialized = JSON.stringify(result);
    for (const secret of ['private description', 'private resume', '/private/resume.pdf', 'private answer', '123456']) assert.equal(serialized.includes(secret), false);
  }
});

test('MCP read tools validate schemas and cannot invoke change or approval actions', async () => {
  const mcp = make();
  await assert.rejects(mcp.call('daymark_application_status', {}), /Missing jobId/);
  await assert.rejects(mcp.call('daymark_find_jobs', { query: 'x', send: true }), /Unexpected/);
  await assert.rejects(mcp.call('daymark_tracker_page', { limit: 51 }), /Invalid limit/);
  await assert.rejects(mcp.call('daymark_tracker_page', { cursor: '../secret' }), /Invalid cursor/);
  await assert.rejects(mcp.call('submit_application', { taskId: 't1' }), /Unknown/);
});

test('MCP read failures are generic and do not expose paths or connection details', async () => {
  const mcp = createMcpReadInterface(createAgentReadTools(async () => { throw new Error('open /Users/private/daymark/state.json failed: postgres://secret'); }));
  const result = await mcp.call('daymark_find_jobs');
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Daymark could not read this right now.');
  assert.equal(JSON.stringify(result).includes('/Users/private'), false);
  assert.equal(JSON.stringify(result).includes('postgres://'), false);
});
