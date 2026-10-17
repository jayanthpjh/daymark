// End-to-end: real Chrome fills a synthetic unknown career site through the real fill loop (answer engine, dynamic adapter, review, submit).
// The employer site is intercepted in-browser and NVIDIA is mocked; nothing leaves this machine.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const prepId='11111111-1111-1111-1111-111111111111',fillId='22222222-2222-2222-2222-222222222222';
const resume='Alex Doe\n\nSUMMARY\nData engineer delivering reliable pipelines on Spark and Kafka.\n\nSKILLS\nPython, SQL, Spark';

const posting='<h1>Data Engineer</h1><p>Build pipelines.</p><a href="/apply">Apply Now</a>';
const apply=`<!doctype html><body><div id=app></div><script>
let uploaded='';const steps={
 1:'<h2>My Information</h2><label for=f>First Name*</label><input id=f required><label for=l>Last Name*</label><input id=l required><label for=e>Email Address*</label><input id=e type=email required><label for=p>Phone Number</label><input id=p><label for=a>Address Line 1*</label><input id=a required><label for=c>Country*</label><select id=c required><option value="">Select One</option><option>Canada</option><option>United States of America</option></select><label for=s>State*</label><select id=s required><option value="">Select One</option><option>Texas</option><option>Utah</option></select><label for=z>Postal Code*</label><input id=z required><label for=r>Resume</label><input id=r type=file><label for=n>Middle Name</label><input id=n>',
 2:'<h2>Application Questions</h2><fieldset><legend>Are you legally authorized to work in the US?*</legend><label><input type=radio name=auth value=Yes required> Yes</label><label><input type=radio name=auth value=No> No</label></fieldset><label for=w>Why do you want to work here?*</label><textarea id=w required></textarea><label for=g>Gender</label><select id=g><option value="">Select One</option><option>Male</option><option>Female</option><option>I do not wish to answer</option></select><label for=o>Favorite color</label><input id=o>',
 3:'<h2>Review</h2><p>Check your details.</p><li id=receipt></li><input id=r type=file>'};
let n=1;const app=document.getElementById('app');
function show(){app.innerHTML=steps[n]+(n<3?'<button id=next type=button>Next</button>':'<button id=submit type=button>Submit application</button>')+'<p id=msg></p>';
 const file=document.getElementById('r');if(file)file.onchange=()=>{uploaded=file.files[0]?.name||''};const receipt=document.getElementById('receipt');if(receipt)receipt.textContent=uploaded+' successfully uploaded';
 const next=document.getElementById('next');if(next)next.onclick=()=>{const bad=[...app.querySelectorAll('[required]')].filter(x=>x.type==='radio'?!app.querySelector('[name='+x.name+']:checked'):!x.value);if(bad.length){document.getElementById('msg').textContent='Complete required fields';return}n++;show()};
 const submit=document.getElementById('submit');if(submit)submit.onclick=()=>{window.__submits=(window.__submits||0)+1;document.body.innerHTML='<h1>Thank you for applying</h1>'}}
show();</script></body>`;

async function scenario(name,{aiAnswers,noSubmit=false},run){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-dyn-'));await fs.mkdir(path.join(dir,'files'));
  await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=test\nAPPLICATION_EMAIL=apply@example.test\n');await fs.writeFile(path.join(dir,'files','draft.pdf'),'%PDF synthetic');
  await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({automaticSubmissionVersion:1,preferences:{reviewBeforeSubmit:true,aiAnswers},
    profile:{name:'Alex Doe',email:'apply@example.test',phone:'555-0100',location:'Austin, TX',addressLine1:'1 Main St',postalCode:'73301'},
    answerPack:{version:2,completed:true,values:{authorization_us:'Yes'}},onboarding:{profileConfirmed:true,completed:true},
    jobs:[{id:'j',company:'Fixture Co',role:'Data Engineer',description:'Build data pipelines with Spark.',url:'https://careers.fixture.example/jobs/1'}],
    tasks:[{id:fillId,type:'fill',jobId:'j',parentTaskId:prepId,status:'queued',reviewPolicy:'final'},{id:prepId,type:'prepare',jobId:'j',status:'ready_for_review',reviewPolicy:'final',artifacts:{resume,coverLetter:'Hi',resumePdf:path.join(dir,'files','draft.pdf'),resumeDocx:path.join(dir,'files','draft.docx'),sourceProfile:{name:'Alex Doe'},changes:[],proposedAdditions:[],approved:false}}],applications:[]}));
  await fs.writeFile(path.join(dir,'preload.mjs'),`import {chromium} from ${JSON.stringify(path.join(process.cwd(),'node_modules/playwright/index.mjs'))};
const posting=${JSON.stringify(posting)},apply=${JSON.stringify(noSubmit?apply.replace('Submit application','Save draft'):apply)};
globalThis.__nvidia=0;const realFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{if(String(url).includes('integrate.api.nvidia.com')){globalThis.__nvidia++;const user=JSON.parse(JSON.parse(opts.body).messages[1].content);const answers=user.questions.map(q=>({id:q.id,answer:q.options.length?q.options[0]:'I want to build reliable data platforms like Spark pipelines.',evidence:'',missingFacts:false}));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers})}}]}),{status:200,headers:{'content-type':'application/json'}});}return realFetch(url,opts);};
const launch=chromium.launchPersistentContext.bind(chromium);
chromium.launchPersistentContext=async(profile,options)=>{const context=await launch(path.join(${JSON.stringify(dir)},'chrome-test'),{...options,headless:!process.env.DAYMARK_TEST_HEADED,...(process.env.DAYMARK_TEST_HEADED?{slowMo:500,args:[...(options?.args||[]),'--window-size=1100,900']}:{}),...(process.env.DAYMARK_TEST_CHROME?{executablePath:process.env.DAYMARK_TEST_CHROME}:{})});
 await context.route('https://careers.fixture.example/**',route=>{const p=new URL(route.request().url()).pathname;route.fulfill({status:200,contentType:'text/html',body:p==='/apply'?apply:posting});});return context;};
import path from 'node:path';`);
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const child=spawn(process.execPath,['--import',path.join(dir,'preload.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env')},stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',c=>err+=c);
  const api=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,body:await r.json().catch(()=>({}))};};
  const fill=async()=>(await api('/api/state')).body.tasks.find(t=>t.id===fillId);
  const waitFor=async(check,label,tries=400)=>{for(let i=0;i<tries;i++){try{const v=await check();if(v)return v}catch{}await new Promise(r=>setTimeout(r,150))}throw new Error(`${name}: timed out waiting for ${label}. ${err} ${JSON.stringify(await fill().catch(()=>null))}`)};
  try{await waitFor(async()=>(await api('/api/health')).status===200,'server');await run({api,fill,waitFor,dir,port});console.log('ok -',name)}finally{child.kill('SIGKILL');await new Promise(r=>setTimeout(r,500));await fs.rm(dir,{recursive:true,force:true})}
}

await scenario('unknown site, AI off: fills profile/EEO-free fields, stops only on the required open question, learns the answer, submits after review',{aiAnswers:false},async({api,fill,waitFor,dir})=>{
  const paused=await waitFor(async()=>{const f=await fill();return f?.status==='needs_you'&&f.checkpoint?.questions?.length&&f},'pause on the open question');
  assert.equal(paused.dynamicEntered,true);assert.equal(paused.entryHow,'click');
  const open=paused.checkpoint.questions.filter(q=>paused.checkpoint.unresolvedIds.includes(q.id));
  assert.deepEqual(open.map(q=>q.label.replace(/\*/g,'')),['Why do you want to work here?'],'only the unknown required question blocks');
  const step1=paused.filledSteps?.find(s=>s.step==='My Information');assert.ok(step1,'step 1 recorded');
  const byLabel=Object.fromEntries(step1.answers.map(a=>[a.label,a]));
  assert.equal(byLabel['First Name'].value,'Alex');assert.equal(byLabel['First Name'].source,'profile');
  assert.equal(byLabel['Country'].value,'United States of America');assert.equal(byLabel['State'].value,'Texas');assert.equal(byLabel['Postal Code'].value,'73301');assert.equal(byLabel['Address Line 1'].value,'1 Main St');
  // Resolve this step / Continue in background must re-run the fill pipeline (sign-in, restore, recheck) instead of reopening a bare page.
  const opened=await api(`/api/tasks/${fillId}/handoff`,{showBrowser:true});assert.equal(opened.status,200,JSON.stringify(opened.body));assert.equal(opened.body.task.manualHandoff,true);
  const reopened=await waitFor(async()=>{const f=await fill();return f?.status==='needs_you'&&f.manualHandoff&&f.checkpoint?.questions?.length&&f.filledSteps?.length&&f},'handoff reopened and refilled');
  assert.ok(reopened.checkpoint.unresolvedIds?.length>=1,JSON.stringify({status:reopened.status,stage:reopened.stage,msg:reopened.message,cp:Object.keys(reopened.checkpoint)}));
  const resumed=await api(`/api/tasks/${fillId}/handoff/resume`,{});assert.equal(resumed.status,200,JSON.stringify(resumed.body));
  const paused2=await waitFor(async()=>{const f=await fill();return f?.status==='needs_you'&&!f.manualHandoff&&f.checkpoint?.questions?.length&&f},'resume rechecked the step');
  const open2=paused2.checkpoint.questions.filter(q=>paused2.checkpoint.unresolvedIds.includes(q.id));assert.deepEqual(open2.map(q=>q.label.replace(/\*/g,'')),['Why do you want to work here?']);
  const answered=await api(`/api/tasks/${fillId}/answers`,{checkpointId:paused2.checkpoint.id,answers:{[open2[0].id]:'Because I like building data platforms.'}});assert.equal(answered.status,202,JSON.stringify(answered.body));
  const ready=await waitFor(async()=>{const f=await fill();return f?.status==='needs_you'&&f.finalReviewReady&&f},'final review');
  assert.equal(ready.stage,'Awaiting your review');
  assert.ok(ready.receipt.skipped.includes('Favorite color'),'optional unknown question is skipped, not blocking');
  assert.equal(ready.receipt.ai,0);
  const step2=ready.filledSteps.find(s=>/Application Questions/.test(s.step));const q2=Object.fromEntries(step2.answers.map(a=>[a.label.replace(/\?$/,''),a]));
  assert.equal(q2['Are you legally authorized to work in the US'].value,'Yes');assert.equal(q2['Are you legally authorized to work in the US'].source,'answer pack');
  assert.equal(q2['Why do you want to work here'].source,'you');
  const stateFile=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));assert.ok(!Object.keys(stateFile.applicationAnswerPack||{}).some(k=>/why do you want/i.test(k)),'answer is not remembered without explicit save');
  const review=await api(`/api/tasks/${prepId}/review`,{resumeText:resume,confirmedAccurate:true,submitAfter:true});assert.equal(review.status,200,JSON.stringify(review.body));
  const done=await waitFor(async()=>{const f=await fill();return f?.status==='completed'&&f},'submission');
  assert.equal(done.submittedBy,'agent_after_review');
  const cache=JSON.parse(await fs.readFile(path.join(dir,'adapters','careers.fixture.example.json'),'utf8'));assert.equal(cache.trust.submitted,1);assert.equal(cache.entry.how,'click');
});
await scenario('unknown site, AI on: open-ended answer drafted (marked AI) and fill reaches review with no pause',{aiAnswers:true},async({fill,waitFor})=>{
  const ready=await waitFor(async()=>{const f=await fill();if(f?.status==='needs_you'&&!f.finalReviewReady&&f.stage!=='Opening application')throw new Error('paused: '+f.message);return f?.status==='needs_you'&&f.finalReviewReady&&f},'final review');
  assert.equal(ready.receipt.ai,1);const why=ready.filledSteps.flatMap(s=>s.answers).find(a=>/why do you want/i.test(a.label));assert.equal(why.source,'ai');assert.match(why.value,/data platforms/);
  assert.equal(ready.llmCalls>=1,true);
});
await scenario('legacy review-off setting still pauses at final review',{aiAnswers:true},async({api,fill,waitFor})=>{
  await api('/api/preferences',{reviewBeforeSubmit:false});
  const ready=await waitFor(async()=>{const f=await fill();return f?.status==='needs_you'&&f.finalReviewReady&&f},'final review');
  assert.equal(ready.stage,'Awaiting your review');assert.equal(ready.orchestration.state,'final_review');
});
await scenario('a page without a Submit button is never called final review',{aiAnswers:true,noSubmit:true},async({fill,waitFor})=>{
  const held=await waitFor(async()=>{const f=await fill();return f?.status==='needs_you'&&/no Submit button/.test(f.message||'')&&f},'held because no Submit control');
  assert.equal(held.finalReviewReady,false);
});
