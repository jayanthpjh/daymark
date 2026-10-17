// Destructive fault injection is confined to a fresh temporary PostgreSQL cluster and synthetic app.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {supervise} from '../scripts/service-runner.mjs';
const exec=promisify(execFile);
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-recovery-drill-'));
const db=path.join(dir,'pg');const data=path.join(dir,'app');await fs.mkdir(data);
const pgBin=process.env.DAYMARK_TEST_PG_BIN||'/opt/homebrew/bin';
const freePort=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;};
const pgPort=await freePort(),appPort=await freePort();
const user=os.userInfo().username;
let postgresRunning=false,runner,child,starts=0;const events=[];
const pgStart=async()=>{await exec(path.join(pgBin,'pg_ctl'),['-D',db,'-l',path.join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort} -k ${dir}`,'start']);postgresRunning=true;};
const pgStop=async()=>{await exec(path.join(pgBin,'pg_ctl'),['-D',db,'stop','-m','fast']);postgresRunning=false;};
const waitFor=async(check,label)=>{const deadline=Date.now()+45000;while(Date.now()<deadline){try{const result=await check();if(result)return result;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`Timed out: ${label}`);};
const request=async(route)=>{const r=await fetch(`http://127.0.0.1:${appPort}${route}`,{signal:AbortSignal.timeout(6500)});return {status:r.status,body:await r.json()};};
const checkpoint={id:'test-checkpoint',step:'Review',questions:[{id:'q',label:'Name',value:'Synthetic Applicant'}],pauseReason:'submission'};
try{
 await exec(path.join(pgBin,'initdb'),['-D',db,'-A','trust','--no-locale']);await pgStart();
 await fs.writeFile(path.join(data,'env'),`DAYMARK_DATABASE_URL=postgresql://${encodeURIComponent(user)}@127.0.0.1:${pgPort}/postgres\n`);
 await fs.writeFile(path.join(data,'state.json'),JSON.stringify({automaticSubmissionVersion:2,profile:{name:'Synthetic Applicant'},preferences:{reviewBeforeSubmit:true,autoApply:{enabled:false}},jobs:[{id:'job',company:'Synthetic employer',url:'https://example.test/job'}],tasks:[{id:'fill',type:'fill',jobId:'job',status:'running',submitAttemptedAt:new Date().toISOString(),checkpoint}],applications:[]}));
 await fs.writeFile(path.join(data,'pause.mjs'),`const original=globalThis.setInterval;globalThis.setInterval=(fn,delay,...args)=>original(delay===500?()=>{}:fn,delay,...args);`);
 const log=await fs.open(path.join(dir,'backend.log'),'a');
 runner=supervise({spawnChild:()=>{starts++;child=spawn(process.execPath,['--import',path.join(data,'pause.mjs'),'server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(appPort),DAYMARK_ROLE:'combined',DAYMARK_DATABASE_URL:`postgresql://${encodeURIComponent(user)}@127.0.0.1:${pgPort}/postgres`,DAYMARK_REDIS_URL:'',DAYMARK_DATA_DIR:data,DAYMARK_ENV_PATH:path.join(data,'env'),DAYMARK_DISABLE_MAIL_FORWARDING:'true',DAYMARK_AUTOMATION_DELAY_MS:'3600000'},stdio:['ignore',log.fd,log.fd]});return child;},log:event=>events.push(event)});
 await waitFor(async()=>(await request('/api/health')).status===200,'initial readiness');
 const before=(await request('/api/state')).body;
 assert.equal(before.tasks[0].status,'needs_you');assert.equal(before.tasks[0].finalReviewReady,false);
 assert.deepEqual(before.tasks[0].checkpoint.id,checkpoint.id);
 console.log('PASS startup: interrupted submission is held for reconciliation');
 const originalPid=child.pid;
 await pgStop();
 await waitFor(async()=>(await request('/api/health')).status===503,'storage outage readiness');
 assert.equal(child.pid,originalPid);assert.equal(starts,1);
 console.log('PASS database outage: readiness becomes 503; backend stays alive');
 await pgStart();
 await waitFor(async()=>(await request('/api/health')).status===200,'storage reconnection');
 assert.equal(child.pid,originalPid);assert.equal((await request('/api/state')).body.tasks[0].checkpoint.id,checkpoint.id);
 console.log('PASS database recovery: same process reconnects; checkpoint survives');
 child.kill('SIGKILL');
 await waitFor(async()=>starts>=2&&(await request('/api/health')).status===200,'crashed backend restart');
 assert.notEqual(child.pid,originalPid);
 const restored=(await request('/api/state')).body.tasks.find(t=>t.id==='fill');
 assert.equal(restored.status,'needs_you');assert.equal(restored.checkpoint.id,checkpoint.id);assert.equal(restored.submitRequested,false);assert.ok(restored.submitAttemptedAt);
 assert.equal(events.filter(e=>e.event==='service_restart_scheduled').length,starts-1);
 console.log('PASS backend SIGKILL: one replacement; uncertain submission never requeued');
 console.log('No employer, real database, or live Daymark process was touched.');
 await log.close();
}finally{
 runner?.stop();if(child&&child.exitCode===null)await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);
 if(child&&child.exitCode===null)child.kill('SIGKILL');
 if(postgresRunning)await pgStop().catch(()=>{});
 // Keep evidence on disk; the cluster is stopped and uses only synthetic data.
 console.log(`Evidence: ${dir}`);
}
