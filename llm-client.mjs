// Routes JSON LLM calls between the hosted NVIDIA model and a self-hosted OpenAI-compatible model (Ollama on OCI).
// Heavy persuasive writing prefers NVIDIA; light classification and drafting prefers the local model; each falls back to the other.
import { parseNvidiaResult, requestNvidiaJson } from './nvidia-client.mjs';

export const LLM_TASKS = Object.freeze(['resume', 'cover', 'tailor', 'answers', 'mail', 'classify', 'embed']);
const LOCAL_FIRST = new Set(['answers', 'mail', 'classify']);

export function llmConfig(env = process.env) {
  const baseUrl = String(env.LLM_BASE_URL || '').trim().replace(/\/+$/, '');
  if (baseUrl && !/^https?:\/\/[^\s/]+(?::\d+)?(?:\/[^\s]*)?$/.test(baseUrl)) throw new Error('LLM_BASE_URL must be an http(s) URL.');
  return { local: baseUrl ? { baseUrl, model: String(env.LLM_MODEL || 'qwen3:8b'), key: String(env.LLM_API_KEY || ''), timeoutMs: Number(env.LLM_TIMEOUT_MS) || 120000 } : null, nvidiaKey: String(env.NVIDIA_API_KEY || '') };
}

export function llmRoute(task, config, overrides = {}) {
  if (!LLM_TASKS.includes(task)) throw new Error(`Unknown LLM task: ${task}`);
  const chosen = overrides[task];
  const available = [config.local && 'local', config.nvidiaKey && 'nvidia'].filter(Boolean);
  if (!available.length) return [];
  const first = chosen && available.includes(chosen) ? chosen : (LOCAL_FIRST.has(task) ? 'local' : 'nvidia');
  const primary = available.includes(first) ? first : available[0];
  return [primary, ...available.filter(item => item !== primary)];
}

export async function requestLocalJson({ config, messages, maxTokens = 2000, fetchImpl = fetch }) {
  const { baseUrl, model, key, timeoutMs } = config.local;
  const headers = { 'content-type': 'application/json', accept: 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) };
  const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers, signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: Math.min(8192, Math.max(256, maxTokens)), stream: false, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false } }) });
  if (!response.ok) throw new Error(`Local model request failed (${response.status}).`);
  const result = await response.json().catch(() => ({}));
  return parseNvidiaResult(result);
}

// Returns { value, provider, fellBack }. `sensitive` content (legal, consent, demographic answers) never goes to any model.
export async function requestLlmJson({ task, messages, maxTokens = 3000, env = process.env, overrides = {}, sensitive = false, fetchImpl = fetch, pause } = {}) {
  if (sensitive) throw new Error('This question is never sent to an AI model.');
  const config = llmConfig(env);
  const order = llmRoute(task, config, overrides);
  if (!order.length) throw new Error('Add an NVIDIA API key in Settings or configure a local model first.');
  const errors = [];
  for (const [index, provider] of order.entries()) {
    try {
      const value = provider === 'local'
        ? await requestLocalJson({ config, messages, maxTokens, fetchImpl })
        : await requestNvidiaJson({ key: config.nvidiaKey, messages, maxTokens, fetchImpl, ...(pause ? { pause } : {}) });
      return { value, provider, fellBack: index > 0 };
    } catch (error) { errors.push(`${provider}: ${error.message}`); }
  }
  throw new Error(order.length > 1 ? `Both models failed. ${errors.join(' ')}` : errors[0].replace(/^[a-z]+: /, ''));
}
