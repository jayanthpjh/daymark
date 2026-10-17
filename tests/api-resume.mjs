import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-resume-test-'));
await fs.writeFile(path.join(dir,'env'),'');
await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({profile:{resumeText:'Alex Doe\nAcme Engineer 2022\nBeta Engineer 2024',name:'Previous Name'},tasks:[],jobs:[],applications:[],onboarding:{step:'profile',profileConfirmed:false,completed:false}}));
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'4196',DAYMARK_DATA_DIR:dir,DAYMARK_ENV_PATH:path.join(dir,'env')},stdio:'ignore'});
const request=(route,body)=>fetch(`http://127.0.0.1:4196${route}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});
try{
 let ready=false;for(let i=0;i<50;i++){try{ready=(await request('/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const doc={experience:[{employer:'Acme',title:'Engineer',startDate:'2022',bullets:['Built pipelines.']},{employer:'Beta',title:'Engineer',startDate:'2024',bullets:['Designed platforms.']}],education:[],projects:[],certifications:[]};
 let response=await request('/api/profile/draft',{fields:{name:'Alex Doe',headline:'Long summary. '.repeat(60),roleSearch:'Engineer'},document:doc});assert.equal(response.status,200);
 let state=await (await request('/api/state')).json();assert.equal(state.profile.name,'Previous Name');assert.equal(state.resumeDraft.fields.name,'Alex Doe');assert.equal(state.resumeDraft.document.experience.length,2);
 response=await request('/api/profile',{name:'Alex Doe',headline:'Long summary. '.repeat(60),roleSearch:'Engineer',document:doc});assert.equal(response.status,200);const saved=await response.json();assert.ok(saved.profile.headline.length>240);assert.match(saved.profile.workHistory,/Acme/);assert.match(saved.profile.workHistory,/Beta/);assert.equal(saved.profile.resumeDocument.experience.length,2);
 const html=await (await request('/api/profile/template')).text();assert.match(html,/Acme/);assert.match(html,/Beta/);
 response=await request('/api/onboarding',{completed:true});assert.equal(response.status,400);
 response=await request('/api/profile/resume/reparse',{});assert.equal(response.status,400);
 const mailId='a'.repeat(64);response=await request('/api/proton/message-labels',{id:mailId,categories:['Interview','Verification']});assert.equal(response.status,200);let labels=JSON.parse(await fs.readFile(path.join(dir,'mail-labels.json'),'utf8'));assert.deepEqual(labels[mailId],['Interview','Verification']);response=await request('/api/proton/message-labels',{id:mailId,categories:['Imaginary']});assert.equal(response.status,400);response=await request('/api/proton/message-labels',{id:mailId,categories:null});assert.equal(response.status,200);labels=JSON.parse(await fs.readFile(path.join(dir,'mail-labels.json'),'utf8'));assert.equal(labels[mailId],undefined);
 console.log('PASS: draft persistence, confirmed-profile preservation, full summary, structured master serialization, template preview, setup enforcement, model consent. No user data or external model used.');
}finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await fs.rm(dir,{recursive:true,force:true});}
