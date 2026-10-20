// Assistant actions end to end: the model proposes, cards wait for the applicant, nothing runs unasked.
// Real server, temp data dir, mock model, demo mailbox store (synthetic file). No employer is contacted.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-agent-actions-'));await fs.mkdir(path.join(dir,'files'));
await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=synthetic\nLLM_HOSTED_ENABLED=true\nDAYMARK_NVIDIA_LIVE_APPROVED=true\n');
const plan={reply:'Ready when you are.',calls:[
  {name:'submit_application',args:{taskId:'f1'}},
  {name:'send_mail',args:{to:'sam@acme.example',subject:'Availability',body:'Thursday works for me.'}},
  {name:'answer_consent',args:{questionId:'sms',value:'Yes'}},
  {name:'run_shell',args:{cmd:'rm -rf /'}}]};
await fs.writeFile(path.join(dir,'preload.mjs'),`const o=globalThis.setInterval;globalThis.setInterval=(c,d,...a)=>o(d===500?()=>{}:c,d,...a);const f=globalThis.fetch;globalThis.fetch=async(u,x)=>String(u).includes('integrate.api.nvidia.com')?new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(${JSON.stringify(plan)})}}]}),{status:200,headers:{'content-type':'application/json'}}):f(u,x);`);
const now=new Date().toISOString();
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({profile:{name:'Alex Doe',resumeText:'r',email:'apply@example.test'},onboarding:{profileConfirmed:true},answerPack:{version:2,values:{},completed:true},
 jobs:[{id:'j',company:'Acme',role:'Data Engineer',url:'https://boards.greenhouse.io/acme/jobs/1'}],
 tasks:[{id:'a0',type:'prepare',jobId:'j',company:'Acme',role:'Data Engineer',status:'ready_for_review',reviewPolicy:'final',artifacts:{resume:'r',approved:true,versions:[],reviewHistory:[],changes:[]},createdAt:now,updatedAt:now},
  {id:'f1',type:'fill',jobId:'j',parentTaskId:'a0',company:'Acme',role:'Data Engineer',status:'needs_you',stage:'Awaiting your review',finalReviewReady:true,reviewPolicy:'final',progress:95,createdAt:now,updatedAt:now}],applications:[]}));
const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
const child=spawn(process.execPath,['--import',path.join(dir,'preload.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env'),DAYMARK_MAIL_DEMO:'true'},stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',c=>err+=c);
const call=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,body:await r.json().catch(()=>({}))};};
const ok=name=>console.log('ok - '+name);
const readState=async()=>JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));
try{
  for(let i=0;i<100&&(await call('/api/health').catch(()=>({status:0}))).status!==200;i++)await new Promise(r=>setTimeout(r,100));
  const conv=(await call('/api/agent/conversations',{})).body.conversation;
  const turn=await call('/api/agent/message',{conversationId:conv.id,requestId:randomUUID(),message:'finish up the Acme application'});
  assert.equal(turn.status,200,JSON.stringify(turn.body));
  const {waiting,refused}=turn.body;
  assert.deepEqual(waiting.map(w=>w.name),['submit_application','send_mail']);
  assert.match(waiting[0].summary,/Submit the application for Acme · Data Engineer/);assert.match(waiting[1].summary,/as a draft in Mail/);
  assert.deepEqual(refused.map(r=>r.name).sort(),['answer_consent','run_shell']);
  assert.match(refused.find(r=>r.name==='answer_consent').reason,/screens/);
  assert.equal((await readState()).tasks.find(t=>t.id==='f1').submitAttemptedAt,undefined);
  ok('submit and mail wait as cards; consent and unknown tools are refused; nothing ran');

  const approvals=(await call('/api/agent/approvals')).body;assert.equal(approvals.pending.length,2);ok('cards are listed from the durable ledger');
  const reloaded=(await call(`/api/agent/conversations/${conv.id}`)).body.conversation;assert.equal(reloaded.turns[0].waiting.length,2);ok('cards persist in the saved conversation');

  const [submitCard,mailCard]=waiting;
  assert.equal((await call('/api/agent/decline',{id:mailCard.id})).body.status,'declined');
  assert.equal((await call('/api/agent/confirm',{id:mailCard.id})).body.status,'not_pending');ok('a declined card cannot be confirmed');

  const submit=await call('/api/agent/confirm',{id:submitCard.id});
  assert.equal(submit.status,200);assert.equal(submit.body.status,'failed');assert.match(submit.body.message,/browser session has closed/);
  const st=await readState();assert.equal(st.tasks.find(t=>t.id==='f1').submitAttemptedAt,undefined);assert.equal(st.tasks.find(t=>t.id==='f1').status,'needs_you');
  assert.equal((await call('/api/agent/confirm',{id:submitCard.id})).body.status,'not_pending');ok('an accepted submit goes through the real submit rules (no browser session: held, not submitted), and cannot repeat');

  const again=await call('/api/agent/message',{conversationId:conv.id,requestId:randomUUID(),message:'save that email as a draft'});
  const mail=await call('/api/agent/confirm',{id:again.body.waiting.find(w=>w.name==='send_mail').id});
  assert.equal(mail.body.status,'done');assert.match(mail.body.approval.outcome.link,/^\/mail\?draft=/);
  const drafts=(await call('/api/mailbox?folder=Drafts')).body.drafts;assert.equal(drafts.length,1);assert.equal(drafts[0].to,'sam@acme.example');ok('an accepted mail card saves a draft in Mail and sends nothing');

  const after=(await call('/api/agent/approvals')).body.recent;
  assert.deepEqual([...new Set(after.map(a=>a.status))].sort(),['declined','done','failed','pending']);
  assert.ok(after.every(a=>a.action&&a.summary),'every card is on the activity list');ok('activity list shows every card with its outcome');
  console.log('PASS: assistant actions');
}catch(e){console.error(e,err.slice(-600));process.exitCode=1;}finally{child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});}
