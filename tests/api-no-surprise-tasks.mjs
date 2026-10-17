// Isolated check that Daymark never creates a task on its own while auto-apply is off, and that creation is traced when it is on.
// Synthetic data, mocked model, paused worker. Nothing leaves this machine.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';

const fresh=new Date().toISOString();
const job=id=>({id,company:'Acme '+id,role:'Data Engineer',url:`https://boards.greenhouse.io/acme${id}/jobs/1`,description:'Requirements: Snowflake, dbt, Python and SQL.',match:98,first_seen_at:fresh,applyMode:'auto',atsType:'greenhouse'});
const seed=autoApply=>({automaticSubmissionVersion:2,preferences:{reviewBeforeSubmit:true,autoApply:{enabled:autoApply,minMatch:70,dailyCap:5,maxAgeDays:7}},
  profile:{name:'Alex Doe',email:'apply@example.test',phone:'555-0100',headline:'Data engineer',skills:'Python, SQL',resumeText:'Alex Doe\n\nSUMMARY\nData engineer.',masterResumeText:'Alex Doe\n\nSUMMARY\nData engineer.',roleSearch:'Data Engineer'},
  onboarding:{profileConfirmed:true,completed:true},jobs:[job('1'),job('2')],tasks:[],applications:[]});

async function run(name,{autoApply,waitMs},verify){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-surprise-'));await fs.mkdir(path.join(dir,'files'));await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=synthetic\n');
  await fs.writeFile(path.join(dir,'preload.mjs'),`const o=globalThis.setInterval;globalThis.setInterval=(c,d,...a)=>o(d===500?()=>{}:c,d,...a);`);
  await fs.writeFile(path.join(dir,'state.json'),JSON.stringify(seed(autoApply)));
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['--import',path.join(dir,'preload.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env'),DAYMARK_AUTOMATION_DELAY_MS:'300'},stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>out+=c);
  const get=async route=>(await fetch(`http://127.0.0.1:${port}${route}`)).json();
  try{
    for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    await new Promise(r=>setTimeout(r,waitMs));
    await verify({state:await get('/api/state'),out});console.log('ok -',name);
  }catch(error){console.error(`FAIL - ${name}`,error.message,'\n',out.slice(-500));process.exitCode=1;}
  finally{child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});}
}

await run('auto-apply off: a restart with fresh, matching, fillable jobs creates no tasks',{autoApply:false,waitMs:4000},({state,out})=>{
  assert.equal(state.tasks.length,0,JSON.stringify(state.tasks.map(t=>[t.type,t.createdBy])));
  assert.doesNotMatch(out,/Task created/);
});
await run('auto-apply on (control): tasks appear, and each says it was created by auto-apply',{autoApply:true,waitMs:3500},({state,out})=>{
  const prepares=state.tasks.filter(t=>t.type==='prepare');
  assert.ok(prepares.length>=1,'the control must create work, or the first test proves nothing');
  assert.ok(prepares.every(t=>t.createdBy==='auto-apply'),JSON.stringify(prepares.map(t=>t.createdBy)));
  assert.match(out,/Task created: prepare [0-9a-f]{8} by auto-apply/);
});
