import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpActionInterface } from './action-interface.mjs';

function setup() {
  const records = new Map(); let prepareCalls = 0, fillProposals = 0;
  const store = { transaction: fn => fn({ get: async (_kind, id) => records.get(id) || null, put: async (_kind, value) => records.set(value.id, value) }) };
  const readInterface = { tools: [], call: async () => ({ structuredContent: { jobs: [{ id: 'job-1', company: 'Example', role: 'Engineer' }] }, content: [], isError: false }) };
  const actions = { change: {
    add_job_link: async ({ url }) => ({ job: { id: 'job-2', company: 'Example', role: 'Engineer' }, url }),
    prepare_application: async ({ jobId, tailoringMode }) => { prepareCalls++; return { status: 'queued', taskId: 'task-1', jobId, tailoringMode }; },
  }, approve: { fill_application: {
    check: async ({ jobId }) => ({ summary: `Fill ${jobId}`, binding: 'prepare:current' }),
  } } };
  const approvalLedger = { propose: async input => { fillProposals++; return { id: 'approval-1', status: 'pending', summary: input.summary }; } };
  const iface = createMcpActionInterface({ readInterface, store, actions, approvalLedger });
  return { iface, get prepareCalls() { return prepareCalls; }, get fillProposals() { return fillProposals; } };
}

test('MCP prepare requests are idempotent and queue only source-backed preparation', async () => {
  const app = setup();
  const args = { jobId: 'job-1', idempotencyKey: 'request_0123456789' };
  const first = await app.iface.call('daymark_prepare_application', args);
  const retry = await app.iface.call('daymark_prepare_application', args);
  assert.deepEqual(retry.structuredContent, first.structuredContent);
  assert.equal(app.prepareCalls, 1);
  assert.equal(first.structuredContent.taskId, 'task-1');
  const conflict = await app.iface.call('daymark_prepare_application', { ...args, jobId: 'different-job' });
  assert.equal(conflict.isError, true);
  assert.match(conflict.content[0].text, /already used for different input/);
  assert.equal(app.prepareCalls, 1);
});

test('MCP fill requests create a Daymark approval card and never run the fill action', async () => {
  const app = setup();
  const result = await app.iface.call('daymark_request_application_fill', { jobId: 'job-1', idempotencyKey: 'request_fill_012345' });
  assert.deepEqual(result.structuredContent, { approvalId: 'approval-1', status: 'pending', summary: 'Fill job-1', nextStep: 'Review and approve this request in Daymark.' });
  assert.equal(app.fillProposals, 1);
  assert.equal(app.iface.tools.some(tool => /submit/i.test(tool.name)), false);
});

test('MCP screening answers enter the existing approval ledger and consent refusals never persist', async () => {
  const proposals = [];
  const store = { transaction: fn => fn({ get: async () => null, put: async () => {} }) };
  const actions = { approve: { answer_question: { check: async ({ questionId }) => questionId === 'consent' ? { error: 'Consent and agreement questions are answered by you on the Questions screen.' } : { summary: 'Review the proposed answer.', binding: 'checkpoint-1' } } } };
  const iface = createMcpActionInterface({ readInterface: { tools: [], call: async () => ({}) }, store, actions, approvalLedger: { propose: async value => { proposals.push(value); return { id: 'answer-approval', status: 'pending' }; } } });
  const valid = await iface.call('daymark_draft_question_answer', { questionId: 'q-1', answer: 'My proposed answer', idempotencyKey: 'request_answer_012345' });
  assert.equal(valid.structuredContent.approvalId, 'answer-approval');
  assert.equal(proposals[0].name, 'answer_question');
  const refused = await iface.call('daymark_draft_question_answer', { questionId: 'consent', answer: 'Yes', idempotencyKey: 'request_consent_01234' });
  assert.equal(refused.isError, true);
  assert.equal(proposals.length, 1);
});

test('MCP write calls fail closed without durable storage and redact service errors', async () => {
  const app = createMcpActionInterface({ readInterface: setup().iface, actions: {}, approvalLedger: {} });
  const result = await app.call('daymark_prepare_application', { jobId: 'job-1', idempotencyKey: 'request_0123456789' });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Daymark could not queue this request.');
});
