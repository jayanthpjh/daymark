import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { supervise } from '../scripts/service-runner.mjs';

test('crashed services restart with backoff; stop cancels restart and forwards signals',async()=>{
 const children=[],delays=[],events=[];let scheduled;
 const run=supervise({spawnChild:()=>{const child=new EventEmitter();child.kill=signal=>events.push(signal);children.push(child);return child;},schedule:(fn,delay)=>{delays.push(delay);scheduled=fn;return 1;},cancel:()=>{scheduled=null;},log:event=>events.push(event),maxRestarts:2});
 children[0].emit('exit',1,null);assert.deepEqual(delays,[1000]);scheduled();
 children[1].emit('exit',1,null);assert.deepEqual(delays,[1000,2000]);scheduled();
 run.stop('SIGTERM');assert.ok(events.includes('SIGTERM'));
 children[2].emit('exit',null,'SIGTERM');assert.equal(children.length,3);assert.equal(delays.length,2);
});
test('restart budget stops a crash loop and startup errors are handled without leaking details',()=>{
 const children=[],logs=[];let next,ended;
 supervise({spawnChild:()=>{const child=new EventEmitter();children.push(child);return child;},schedule:fn=>{next=fn;},log:e=>logs.push(e),onExit:code=>{ended=code;},maxRestarts:1});
 children[0].emit('error',new Error('private data'));children[0].emit('exit',1);next();children[1].emit('exit',1);
 assert.equal(children.length,2);assert.equal(ended,1);assert.ok(logs.some(e=>e.event==='service_restart_limit'));assert.ok(!JSON.stringify(logs).includes('private data'));
});

test('a real child process crash is replaced once and its replacement shuts down cleanly',async()=>{
 const {spawn}=await import('node:child_process');
 let starts=0,runner;const children=[];
 let resolveExit;const exited=new Promise(resolve=>{resolveExit=resolve;});
 const ready=new Promise(resolve=>{
  runner=supervise({spawnChild:()=>{
   const child=spawn(process.execPath,['-e',starts++===0?'process.exit(7)':'console.log("ready");setInterval(()=>{},1000)'],{stdio:['ignore','pipe','ignore']});
   children.push(child);child.stdout.on('data',()=>resolve());return child;
  },schedule:fn=>setTimeout(fn,10),log:()=>{},onExit:resolveExit});
 });
 try{await Promise.race([ready,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('replacement did not start')),5000);t.unref();})]);assert.equal(starts,2);runner.stop();assert.equal(await exited,0);}
 finally{runner?.stop();for(const child of children)if(child.exitCode===null)child.kill();}
});
