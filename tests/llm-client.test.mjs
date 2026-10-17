import test from 'node:test';
import assert from 'node:assert/strict';
import { llmConfig, llmRoute, requestLlmJson } from '../llm-client.mjs';

const ok = json => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(json) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
const both = { LLM_BASE_URL: 'http://llm:11434', NVIDIA_API_KEY: 'k' };

test('routing puts the local model first for every task, NVIDIA as fallback, and only what is configured', () => {
  const config = llmConfig(both);
  for (const task of ['tailor', 'resume', 'answers', 'mail']) assert.deepEqual(llmRoute(task, config), ['local', 'nvidia']);
  const hostedFirst = llmConfig({ ...both, LLM_HOSTED_FIRST: 'tailor, resume' });
  assert.deepEqual(llmRoute('tailor', hostedFirst), ['nvidia', 'local']);
  assert.deepEqual(llmRoute('answers', hostedFirst), ['local', 'nvidia']);
  assert.deepEqual(llmRoute('answers', config, { answers: 'nvidia' }), ['nvidia', 'local']);
  assert.deepEqual(llmRoute('classify', llmConfig({ NVIDIA_API_KEY: 'k' })), ['nvidia']);
  assert.deepEqual(llmRoute('resume', llmConfig({ LLM_BASE_URL: 'http://llm:11434' })), ['local']);
  assert.deepEqual(llmRoute('resume', llmConfig({})), []);
  assert.throws(() => llmRoute('nope', llmConfig(both)), /Unknown LLM task/);
  assert.throws(() => llmConfig({ LLM_BASE_URL: 'ftp://x' }), /http\(s\) URL/);
});
test('local model answers a light task without touching NVIDIA', async () => {
  const urls = [];
  const result = await requestLlmJson({ task: 'answers', messages: [], env: both, fetchImpl: async url => { urls.push(String(url)); return ok({ answer: 'x' }); } });
  assert.deepEqual(result, { value: { answer: 'x' }, provider: 'local', fellBack: false });
  assert.deepEqual(urls, ['http://llm:11434/v1/chat/completions']);
});
test('falls back to the other model on a timeout, a bad status or invalid JSON', async () => {
  for (const failure of [async () => { throw new Error('timeout'); }, async () => new Response('{}', { status: 503 }), async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] }), { status: 200 })]) {
    const result = await requestLlmJson({ task: 'answers', messages: [], env: both, fetchImpl: async url => String(url).includes('llm:11434') ? failure() : ok({ answer: 'from nvidia' }) });
    assert.equal(result.provider, 'nvidia'); assert.equal(result.fellBack, true); assert.equal(result.value.answer, 'from nvidia');
  }
});
test('reports both failures, and never sends sensitive content anywhere', async () => {
  await assert.rejects(requestLlmJson({ task: 'answers', messages: [], env: both, fetchImpl: async () => new Response('{}', { status: 500 }) }), /Both models failed/);
  let called = false;
  await assert.rejects(requestLlmJson({ task: 'answers', messages: [], env: both, sensitive: true, fetchImpl: async () => { called = true; return ok({}); } }), /never sent/);
  assert.equal(called, false);
  await assert.rejects(requestLlmJson({ task: 'answers', messages: [], env: {} }), /Add an NVIDIA API key/);
});
