import test from 'node:test';
import assert from 'node:assert/strict';
import { llmConfig, llmRoute, requestLlmJson } from '../llm-client.mjs';

const ok = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
const both = { LLM_BASE_URL: 'http://llm:11434', NVIDIA_API_KEY: 'test', LLM_HOSTED_ENABLED: 'true', DAYMARK_NVIDIA_LIVE_APPROVED: 'true' };

test('routing rejects unknown tasks and never honours legacy cross-provider overrides', () => {
  assert.deepEqual(llmRoute('tailor', llmConfig(both), { tailor: 'local' }), ['nvidia']);
  assert.throws(() => llmRoute('nope', llmConfig(both)), /Unknown LLM task/);
  assert.throws(() => llmConfig({ LLM_BASE_URL: 'ftp://x' }), /http\(s\) URL/);
  assert.throws(() => llmConfig({ LLM_BASE_URL: 'https://public-model.example' }), /local or private/);
  assert.throws(() => llmConfig({ LLM_BASE_URL: 'http://169.254.169.254' }), /local or private/);
});

test('sensitive content is blocked before any provider call', async () => {
  let called = false;
  await assert.rejects(requestLlmJson({ task: 'answers', messages: [], env: both, sensitive: true, fetchImpl: async () => { called = true; return ok({}); } }), /never sent/);
  assert.equal(called, false);
  await assert.rejects(requestLlmJson({ task: 'answers', env: {} }), /Add an NVIDIA API key/);
  await assert.rejects(requestLlmJson({ task: 'answers', env: { NVIDIA_API_KEY: 'test', DAYMARK_NVIDIA_LIVE_APPROVED: 'false' }, fetchImpl: async () => { called = true; return ok({}); } }), /production use is not approved/);
  await assert.rejects(requestLlmJson({ task: 'answers', env: { NVIDIA_API_KEY: 'test', LLM_HOSTED_ENABLED: 'true' }, fetchImpl: async () => { called = true; return ok({}); } }), /production use is not approved/);
  await assert.rejects(requestLlmJson({ task: 'answers', env: { NVIDIA_API_KEY: 'test', DAYMARK_NVIDIA_LIVE_APPROVED: 'true' }, fetchImpl: async () => { called = true; return ok({}); } }), /Enable hosted writing/);
  assert.equal(called, false);
});
