import test from 'node:test';
import assert from 'node:assert/strict';
import {requestNvidiaJson} from '../nvidia-client.mjs';
const ok=()=>new Response(JSON.stringify({choices:[{message:{content:'{"answer":"draft"}'}}]}));
test('configured model is sent and every transient retry reserves a rate slot',async()=>{
 let calls=0,slots=0;const waits=[];
 const value=await requestNvidiaJson({key:'test',model:'z-ai/glm-5.3',env:{},rateLimit:async()=>slots++,pause:async ms=>waits.push(ms),fetchImpl:async(url,options)=>{
  assert.equal(JSON.parse(options.body).model,'z-ai/glm-5.3');
  return ++calls===1?new Response('{}',{status:429,headers:{'retry-after':'7'}}):ok();
 }});
 assert.equal(slots,2);assert.deepEqual(waits,[7000]);assert.equal(value.answer,'draft');
});
test('authentication errors are never retried and transient retries are bounded',async()=>{
 for(const [status,expected] of [[401,1],[503,3]]){
  let calls=0;
  await assert.rejects(requestNvidiaJson({key:'test',rateLimit:async()=>{},pause:async()=>{},fetchImpl:async()=>{calls++;return new Response('{}',{status});}}),/request failed/);
  assert.equal(calls,expected);
 }
});
