export function parseNvidiaResult(result) {
  const choice = result?.choices?.[0];
  if(choice?.finish_reason==='length') throw new Error('NVIDIA reached its output limit before finishing. Your saved documents are unchanged. Retry this task.');
  const content = choice?.message?.content;
  const text = typeof content==='string' ? content : Array.isArray(content) ? content.filter(part=>part.type==='text').map(part=>part.text||'').join('') : '';
  if(!text.trim()) throw new Error('NVIDIA returned no final answer. Your saved documents are unchanged. Retry this task.');
  const json=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try {const value=JSON.parse(json);if(!value || typeof value!=='object' || Array.isArray(value))throw new Error();return value;} catch {throw new Error('NVIDIA returned an invalid JSON answer. Your saved documents are unchanged. Retry this task.');}
}

export async function requestNvidiaJson({key,messages,maxTokens=5000,fetchImpl=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const headers={authorization:`Bearer ${key}`,'content-type':'application/json',accept:'application/json'};
  const signal=AbortSignal.timeout(180000);
  let response=await fetchImpl('https://integrate.api.nvidia.com/v1/chat/completions',{method:'POST',signal,headers,body:JSON.stringify({model:'nvidia/nemotron-3-super-120b-a12b',messages,temperature:0.2,chat_template_kwargs:{enable_thinking:false},max_tokens:Math.min(32768,Math.max(1024,maxTokens+2048)),stream:false})});
  let result=await response.json().catch(()=>({}));
  if(response.status===202) {
    const id=response.headers.get('nvcf-reqid') || result.requestId || result.request_id;
    if(!id || !/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error('NVIDIA accepted the request but supplied no polling identifier. Try again; your draft is unchanged.');
    for(let attempt=0;attempt<60 && response.status===202;attempt++) {
      await pause(2000);
      response=await fetchImpl(`https://integrate.api.nvidia.com/v1/status/${encodeURIComponent(id)}`,{headers,signal});
      result=await response.json().catch(()=>({}));
    }
    if(response.status===202)throw new Error('NVIDIA is still processing the request. Your saved draft is unchanged. Try again later.');
  }
  if(!response.ok)throw new Error(`NVIDIA request failed (${response.status}). ${response.status===429?'The rate limit was reached; try again shortly.':response.status===401||response.status===403?'Check the saved API key.':'Retry this task.'}`);
  return parseNvidiaResult(result);
}
