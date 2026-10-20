// External NVIDIA calls are gated; browser field understanding remains deterministic in the approved Docker setup.
import { isIP } from 'node:net';
import { parseNvidiaResult, requestNvidiaJson } from './nvidia-client.mjs';

export const LLM_TASKS = Object.freeze(['resume', 'cover', 'tailor', 'answers', 'form', 'mail']);

function localModelHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (['localhost', 'llm', 'ollama', 'host.docker.internal'].includes(host) || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  const family = isIP(host);
  if (family === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
  }
  if (family === 6) return host === '::1' || /^f[cd]/i.test(host);
  return false;
}

export function llmConfig(env = process.env) {
  const baseUrl = env.DAYMARK_LOCAL_LLM_DISABLED === 'true' ? '' : String(env.LLM_BASE_URL || '').trim().replace(/\/+$/, '');
  if (baseUrl) {
    let url;
    try { url = new URL(baseUrl); } catch { throw new Error('LLM_BASE_URL must be an http(s) URL.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('LLM_BASE_URL must be an http(s) URL.');
    if (url.username || url.password || url.search || url.hash) throw new Error('LLM_BASE_URL cannot contain credentials, query parameters or fragments.');
    if (!localModelHost(url.hostname)) throw new Error('LLM_BASE_URL must point to a local or private model endpoint.');
  }
  // Hosted inference with application data requires two explicit, independent opt-ins.
  const hostedAllowed = env.LLM_HOSTED_ENABLED === 'true' && env.DAYMARK_NVIDIA_LIVE_APPROVED === 'true';
  return {
    local: baseUrl ? { baseUrl, model: String(env.LLM_MODEL || 'qwen3:4b'), key: String(env.LLM_API_KEY || ''), timeoutMs: Number(env.LLM_TIMEOUT_MS) || 120000 } : null,
    nvidiaKey: hostedAllowed ? String(env.NVIDIA_API_KEY || '').trim() : '',
    nvidiaModel: String(env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b'),
  };
}

export function llmRoute(task, config) {
  if (!LLM_TASKS.includes(task)) throw new Error(`Unknown LLM task: ${task}`);
  if (config.nvidiaKey) return ['nvidia'];
  if (task === 'form' && config.local) return ['local'];
  return [];
}

// One inference at a time; the request timeout starts after waiting for the queue.
let localTail = Promise.resolve();
let localPending = 0;
async function queuedLocal(args) {
  if (localPending >= 32) throw new Error('Local model queue is full. Try again later.');
  localPending++;
  const result = localTail.then(() => requestLocalJson(args));
  localTail = result.catch(() => {});
  try { return await result; } finally { localPending--; }
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
export async function requestLlmJson({ task, messages, maxTokens = 3000, env = process.env, overrides = {}, sensitive = false, fetchImpl = fetch, pause, accept } = {}) {
  if (sensitive) throw new Error('This question is never sent to an AI model.');
  const config = llmConfig(env);
  const order = llmRoute(task, config, overrides);
  if (!order.length) {
    if (!String(env.NVIDIA_API_KEY || '').trim()) throw new Error('Add an NVIDIA API key in Settings and enable hosted writing.');
    if (env.DAYMARK_NVIDIA_LIVE_APPROVED !== 'true') throw new Error('NVIDIA production use is not approved for real application data.');
    if (env.LLM_HOSTED_ENABLED !== 'true') throw new Error('Enable hosted writing in Settings to use NVIDIA.');
    throw new Error('NVIDIA is unavailable for this task.');
  }
  const errors = [];
  for (const [index, provider] of order.entries()) {
    try {
      const value = provider === 'local'
        ? await queuedLocal({ config, messages, maxTokens, fetchImpl })
        : await requestNvidiaJson({ key: config.nvidiaKey, model: config.nvidiaModel, env, messages, maxTokens, fetchImpl, ...(pause ? { pause } : {}) });
      if (accept && !(await accept(value))) throw new Error('Model output failed the factual quality gate.');
      return { value, provider, fellBack: index > 0 };
    } catch (error) { errors.push(`${provider}: ${error.message}`); }
  }
  throw new Error(order.length > 1 ? `Both models failed. ${errors.join(' ')}` : errors[0].replace(/^[a-z]+: /, ''));
}
