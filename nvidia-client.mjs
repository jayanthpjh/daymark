import { waitForHostedSlot } from './hosted-rate-limit.mjs';

export function parseNvidiaResult(result) {
  const choice = result?.choices?.[0];
  if(choice?.finish_reason==='length') throw new Error('NVIDIA reached its output limit before finishing. Your saved documents are unchanged. Retry this task.');
  const content = choice?.message?.content;
  const text = typeof content==='string' ? content : Array.isArray(content) ? content.filter(part=>part.type==='text').map(part=>part.text||'').join('') : '';
  if(!text.trim()) throw new Error('NVIDIA returned no final answer. Your saved documents are unchanged. Retry this task.');
  const json=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try {const value=JSON.parse(json);if(!value || typeof value!=='object' || Array.isArray(value))throw new Error();return value;} catch {throw new Error('NVIDIA returned an invalid JSON answer. Your saved documents are unchanged. Retry this task.');}
}

export async function requestNvidiaJson({key,messages,maxTokens=5000,model,env=process.env,fetchImpl=fetch,rateLimit=waitForHostedSlot,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const headers={authorization:`Bearer ${key}`,'content-type':'application/json',accept:'application/json'};
  model = String(model || env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b');
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(model)) throw new Error('NVIDIA_MODEL must be a provider/model identifier.');
  async function send(url, options) {
    for (let attempt = 0; ; attempt++) {
      await rateLimit({key, env, pause});
      const response = await fetchImpl(url, {...options, signal: AbortSignal.timeout(180000)});
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
      const retry = response.headers.get('retry-after');
      const seconds = retry !== null && retry.trim() !== '' ? Number(retry) : NaN;
      const delay = retry === null ? 1000 * 2 ** attempt : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now();
      if (!Number.isFinite(delay) || delay > 120000) return response;
      await response.body?.cancel();
      await pause(Math.max(1000 * 2 ** attempt, delay));
    }
  }
  let response=await send('https://integrate.api.nvidia.com/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model,messages,temperature:0.2,chat_template_kwargs:{enable_thinking:false},max_tokens:Math.min(32768,Math.max(1024,maxTokens+2048)),stream:false})});
  let result=await response.json().catch(()=>({}));
  if(response.status===202) {
    const id=response.headers.get('nvcf-reqid') || result.requestId || result.request_id;
    if(!id || !/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error('NVIDIA accepted the request but supplied no polling identifier. Try again; your draft is unchanged.');
    for(let attempt=0;attempt<60 && response.status===202;attempt++) {
      await pause(2000);
      response=await send(`https://integrate.api.nvidia.com/v1/status/${encodeURIComponent(id)}`,{headers});
      result=await response.json().catch(()=>({}));
    }
    if(response.status===202)throw new Error('NVIDIA is still processing the request. Your saved draft is unchanged. Try again later.');
  }
  if(!response.ok)throw new Error(`NVIDIA request failed (${response.status}). ${response.status===429?'The rate limit was reached; try again shortly.':response.status===401||response.status===403?'Check the saved API key.':'Retry this task.'}`);
  return parseNvidiaResult(result);
}

/**
 * Request text embeddings from NVIDIA NIM (used for Tsenta-style semantic job-to-resume matching).
 * Returns an array of numeric vectors in the same order as `texts`.
 */
export async function requestNvidiaEmbeddings({
  key,
  texts,
  model,
  inputType = 'passage',
  env = process.env,
  fetchImpl = fetch,
  rateLimit = waitForHostedSlot,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const apiKey = String(key || env.NVIDIA_API_KEY || '').trim();
  if (!apiKey) throw new Error('NVIDIA_API_KEY is required for embeddings.');
  if (!Array.isArray(texts) || !texts.length) return [];
  const embedModel = String(model || env.NVIDIA_EMBED_MODEL || 'nvidia/nv-embedqa-e5-v5');
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(embedModel)) throw new Error('NVIDIA_EMBED_MODEL must be a provider/model identifier.');
  await rateLimit({ key: apiKey, env, pause });
  const response = await fetchImpl('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: embedModel,
      input: texts.map(t => String(t || '').slice(0, 2048)),
      input_type: inputType,
      encoding_format: 'float',
      truncate: 'END',
    }),
  });
  if (!response.ok) throw new Error(`NVIDIA embeddings request failed (${response.status}).`);
  const body = await response.json().catch(() => ({}));
  const data = Array.isArray(body?.data) ? body.data : [];
  if (data.length !== texts.length) throw new Error('NVIDIA embeddings count mismatch.');
  return data.map(item => item.embedding);
}
