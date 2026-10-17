// Live event stream: a change to stored state reaches a connected screen within a few seconds, carrying only a revision.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-events-'));await fs.mkdir(path.join(dir,'files'));
await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=synthetic\n');
await fs.writeFile(path.join(dir,'pause-worker.mjs'),'const o=globalThis.setInterval;globalThis.setInterval=(c,d,...a)=>o(d===500?()=>{}:c,d,...a);');
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({profile:{name:'Alex Doe',resumeText:'r',email:'apply@example.test'},onboarding:{profileConfirmed:true},answerPack:{version:2,values:{},completed:true},jobs:[{id:'j',company:'Acme',role:'Eng',url:'https://boards.greenhouse.io/acme/jobs/1'}],tasks:[],applications:[{id:'a',jobId:'j',company:'Acme',role:'Eng',url:'https://boards.greenhouse.io/acme/jobs/1',status:'submitted',submittedAt:new Date().toISOString(),statusHistory:[]}]}));
const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
const child=spawn(process.execPath,['--import',path.join(dir,'pause-worker.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env')},stdio:'ignore'});
const ok=name=>console.log('ok - '+name);
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const abort=new AbortController();
  const res=await fetch(`http://127.0.0.1:${port}/api/events`,{signal:abort.signal});
  assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/text\/event-stream/);
  const reader=res.body.getReader();const decoder=new TextDecoder();let buffer='';
  // One continuous reader: an abandoned read() would swallow the next chunk.
  (async()=>{try{for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value);}}catch{}})();
  const waitFor=async(pattern,ms)=>{const end=Date.now()+ms;while(Date.now()<end){if(pattern.test(buffer))return true;await new Promise(r=>setTimeout(r,100));}return pattern.test(buffer);};
  assert.ok(await waitFor(/connected/,3000));ok('the stream opens');
  assert.ok(await waitFor(/event: state\ndata: \{"revision":/,4000),'first revision is announced');buffer='';ok('the current revision is announced on connect');
  await fetch(`http://127.0.0.1:${port}/api/tracker/j/note`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'hello'})});
  assert.ok(await waitFor(/event: state/,4000),'a state change is pushed');ok('a change to stored state is pushed to the screen');
  assert.ok(!/Acme|hello|Alex/.test(buffer),'the stream carries no application data');ok('the stream carries only a revision');
  abort.abort();
  console.log('PASS: live events');
}catch(e){console.error(e);process.exitCode=1;}finally{child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});}
