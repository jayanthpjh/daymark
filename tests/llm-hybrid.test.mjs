import test from 'node:test';
import assert from 'node:assert/strict';
import { llmConfig, llmRoute } from '../llm-client.mjs';

const both = { LLM_BASE_URL: 'http://llm:11434', NVIDIA_API_KEY: 'test', LLM_HOSTED_ENABLED: 'true', DAYMARK_NVIDIA_LIVE_APPROVED: 'true' };

test('hosted writing and form understanding route to NVIDIA without cross-provider fallback', () => {
  const config = llmConfig(both);
  for (const task of ['tailor', 'resume', 'cover', 'answers', 'form', 'mail']) assert.deepEqual(llmRoute(task, config), ['nvidia']);
  assert.deepEqual(llmRoute('tailor', llmConfig({ LLM_BASE_URL: both.LLM_BASE_URL })), []);
  assert.deepEqual(llmRoute('form', llmConfig({ LLM_BASE_URL: both.LLM_BASE_URL })), ['local']);
});

test('NVIDIA requires hosted writing and real-data approval as separate opt-ins', () => {
  assert.deepEqual(llmRoute('tailor', llmConfig({ NVIDIA_API_KEY: 'test' })), []);
  assert.deepEqual(llmRoute('tailor', llmConfig({ NVIDIA_API_KEY: 'test', LLM_HOSTED_ENABLED: 'true' })), []);
  assert.deepEqual(llmRoute('tailor', llmConfig({ NVIDIA_API_KEY: 'test', DAYMARK_NVIDIA_LIVE_APPROVED: 'true' })), []);
  assert.deepEqual(llmRoute('tailor', llmConfig({ NVIDIA_API_KEY: 'test', LLM_HOSTED_ENABLED: 'true', DAYMARK_NVIDIA_LIVE_APPROVED: 'true' })), ['nvidia']);
  assert.deepEqual(llmRoute('tailor', llmConfig({ NVIDIA_API_KEY: 'test', LLM_HOSTED_ENABLED: 'false' })), []);
  assert.deepEqual(llmRoute('tailor', llmConfig({ NVIDIA_API_KEY: 'test', DAYMARK_NVIDIA_LIVE_APPROVED: 'false' })), []);
  assert.deepEqual(llmRoute('tailor', llmConfig({ ...both, LLM_HOSTED_ENABLED: 'true' })), ['nvidia']);
});

test('hosted access can be disabled and unsafe local URLs are rejected', () => {
  assert.deepEqual(llmRoute('tailor', llmConfig({ ...both, LLM_HOSTED_ENABLED: 'false' })), []);
  assert.throws(() => llmConfig({ LLM_BASE_URL: 'http://user:secret@llm:11434' }), /credentials/);
});

test('Docker can exclude all model hosting even when old local-model settings remain', () => {
  const config = llmConfig({ DAYMARK_LOCAL_LLM_DISABLED: 'true', LLM_BASE_URL: 'http://llm:11434', NVIDIA_API_KEY: 'test', LLM_HOSTED_ENABLED: 'true', DAYMARK_NVIDIA_LIVE_APPROVED: 'true' });
  assert.equal(config.local, null);
  assert.deepEqual(llmRoute('tailor', config), ['nvidia']);
  assert.deepEqual(llmRoute('form', config), ['nvidia']);
});
