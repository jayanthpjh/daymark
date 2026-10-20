import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedRpm, waitForHostedSlot } from '../hosted-rate-limit.mjs';
test('default rate is 10 and values above 15 fail closed',()=>{
 assert.equal(hostedRpm({}),10);assert.equal(hostedRpm({NVIDIA_RPM:'15'}),15);
 for(const value of ['16','no','0','1.5']) assert.throws(()=>hostedRpm({NVIDIA_RPM:value}),/1 to 15/);
});
test('concurrent hosted requests reserve spaced slots',async()=>{
 const waits=[];
 await Promise.all(Array.from({length:3},()=>waitForHostedSlot({key:'rate-test',env:{},now:()=>100,pause:async ms=>waits.push(ms)})));
 assert.deepEqual(waits,[6000,12000]);
});
test('Redis failures prevent requests rather than bypassing the shared rate limit',async()=>{
 await assert.rejects(waitForHostedSlot({key:'test',env:{},redisClient:{eval:async()=>{throw new Error('redis offline');}}}),/redis offline/);
});
