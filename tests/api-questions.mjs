// Questions inbox API: batch answers across applications, remembering rules, and all-or-nothing validation.
// Runs the real server against a temporary data directory with the queue paused; no browser, model or employer is contacted.
import net from 'node:net';
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-questions-test-'));await fs.mkdir(path.join(dir,'files'));
await fs.writeFile(path.join(dir,'env'),'NVIDIA_API_KEY=synthetic-test-key\n');
await fs.writeFile(path.join(dir,'pause-worker.mjs'),'const original=globalThis.setInterval;globalThis.setInterval=(callback,delay,...args)=>original(delay===500?()=>{}:callback,delay,...args);');
const options=(...labels)=>labels.map(label=>({label,value:label}));
const question=(id,label,extra={})=>({id,label,type:'text',required:true,value:'',options:[],manual:false,...extra});
const waiting=(id,jobId,questions)=>({id,type:'fill',jobId,parentTaskId:'p'+id,status:'needs_you',stage:'Needs your answer',progress:80,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),checkpoint:{id:'cp'+id,step:'Application',url:'https://x.test',questions,unresolvedIds:questions.map(x=>x.id),pauseReason:'answers',capturedAt:new Date().toISOString()}});
const office=id=>question('office'+id,'What is your preferred office location?*',{type:'select',options:options('New York','Menlo Park')});
const gender=id=>question('gender'+id,'What is your gender identity?*',{type:'select',options:options('Male','Female','Non-binary','Decline to self-identify')});
const consent=id=>question('consent'+id,'I consent to Acme processing my data',{type:'select',options:options('Yes','No')});
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({profile:{name:'Alex Doe',resumeText:'r',email:'apply@example.test'},onboarding:{profileConfirmed:true},answerPack:{version:2,values:{},completed:true},
 jobs:[{id:'a',role:'Data Engineer',company:'Acme',url:'https://boards.greenhouse.io/acme/jobs/1'},{id:'b',role:'Platform Engineer',company:'Beta',url:'https://boards.greenhouse.io/beta/jobs/2'}],
 tasks:[waiting('t1','a',[office('1'),gender('1'),consent('1')]),waiting('t2','b',[office('2'),gender('2')])],applications:[]}));
const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const child=spawn(process.execPath,['--import',path.join(dir,'pause-worker.mjs'),'server.mjs'],{env:{...process.env,PORT:String(port),DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env')},stdio:'ignore'});
const exited=new Promise(resolve=>child.once('exit',resolve));
const post=(route,body)=>fetch(`http://127.0.0.1:${port}${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const read=async()=>JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));
const ok=name=>console.log('ok - '+name);
try{
 for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const item=(taskId,questionId,value,extra={})=>({taskId,checkpointId:'cp'+taskId,questionId,value,save:false,...extra});

 // 1. atomic: one invalid option anywhere means nothing is queued or remembered
 let response=await post('/api/questions/answer',{items:[item('t1','office1','New York',{save:true}),item('t2','office2','Mars',{save:true})]});
 assert.equal(response.status,400);let body=await response.json();assert.match(body.errors['t2:office2'],/available option/i);
 let state=await read();assert.deepEqual(state.tasks.map(t=>t.status),['needs_you','needs_you']);assert.equal(state.applicationAnswerPack,undefined);ok('an invalid answer rejects the whole batch');

 // 2. stale checkpoint and unknown task
 response=await post('/api/questions/answer',{items:[{...item('t1','office1','New York'),checkpointId:'old'}]});assert.equal(response.status,400);assert.match((await response.json()).errors.t1,/changed/i);
 response=await post('/api/questions/answer',{items:[item('missing','x','y')]});assert.equal(response.status,400);
 response=await post('/api/questions/answer',{items:[]});assert.equal(response.status,400);ok('stale steps, unknown tasks and empty batches are refused');

 // 3. one fact answered for both applications; EEO saved to the Answer pack; consent applied but never remembered
 response=await post('/api/questions/answer',{items:[
  item('t1','office1','Menlo Park',{save:true}),item('t2','office2','Menlo Park',{save:true}),
  item('t1','gender1','Decline to self-identify',{save:true}),item('t2','gender2','Decline to self-identify',{save:true}),
  item('t1','consent1','Yes',{save:true})]});
 assert.equal(response.status,202,JSON.stringify(await response.clone().json()));body=await response.json();assert.equal(body.queued,2);
 state=await read();
 assert.deepEqual(state.tasks.map(t=>t.status),['queued','queued']);
 assert.deepEqual(state.tasks[0].pendingAnswers,{office1:'Menlo Park',gender1:'Decline to self-identify',consent1:'Yes'});
 assert.deepEqual(state.tasks[1].pendingAnswers,{office2:'Menlo Park',gender2:'Decline to self-identify'});
 assert.equal(state.applicationAnswerPack['What is your preferred office location?*'].answer,'Menlo Park','facts are remembered as learned answers');
 assert.equal(state.answerPack.values.eeo_gender,'Decline to self-identify','EEO answers land in the Answer pack the engine reads');
 assert.equal(state.answerPack.completed,true,'existing pack settings are preserved');
 assert.equal(Object.keys(state.applicationAnswerPack).some(label=>/consent/i.test(label)),false,'a consent is applied to its application but never remembered');
 assert.equal(state.applicationAnswerPack[Object.keys(state.applicationAnswerPack).find(l=>/gender/i.test(l))],undefined,'EEO is not duplicated into learned answers');
 ok('one answer fans out to both applications; facts and EEO are remembered; consent is not');

 // 4. already-queued tasks cannot be answered again
 response=await post('/api/questions/answer',{items:[item('t1','office1','New York')]});assert.equal(response.status,400);ok('a task that already has its answers cannot be answered twice');
 console.log('PASS: questions inbox API');
}finally{child.kill();await exited;await fs.rm(dir,{recursive:true,force:true});}
