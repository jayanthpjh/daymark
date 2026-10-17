import test from 'node:test';import assert from 'node:assert/strict';
import {routeMessage,statusFromMail,companyPhrases,markVerificationCheckpoint} from '../mail-routing.mjs';
const apps=[{id:'p',jobId:'jp',company:'Paramount',role:'Sr Data Engineer (Data Architecture and Modeling)',status:'unconfirmed'},{id:'m',jobId:'jm',company:'4500 Marathon Petroleum Company LP',role:'Senior Data Engineer',status:'in_progress'},{id:'s',jobId:'js',company:'Strategic Innovation Group LLC',role:'Data Engineer',status:'submitted'}];
const jobs=[{id:'jp',url:'https://careers.paramount.com/job/1'},{id:'jm',url:'https://mpc.wd1.myworkdayjobs.com/en-US/MPCCareers/job/x'},{id:'js',url:'https://strategicinnovationgroup.isolvedhire.com/jobs/1'}];
test('company phrases drop numbers and legal suffixes',()=>{assert.deepEqual(companyPhrases('4500 Marathon Petroleum Company LP'),['marathon petroleum','marathon']);assert.ok(companyPhrases('Strategic Innovation Group LLC').includes('strategic innovation'));});
test('routes by sender domain, subject and Workday tenant; ignores ambiguous or unrelated mail',()=>{
  assert.equal(routeMessage({senderAddress:'no-reply@paramount.com',subject:'Thank you for applying',text:''},apps,jobs).applicationId,'p');
  assert.equal(routeMessage({senderAddress:'mpc@myworkday.com',subject:'Marathon Petroleum: application received',text:'Senior Data Engineer'},apps,jobs).applicationId,'m');
  assert.equal(routeMessage({senderAddress:'noreply@isolvedhire.com',subject:'Strategic Innovation Group - interview',text:''},apps,jobs).applicationId,'s');
  assert.equal(routeMessage({senderAddress:'news@medium.com',subject:'Data engineering weekly',text:'Paramount streaming news'},apps,jobs),null,'body mention alone is not enough');
  assert.equal(routeMessage({senderAddress:'jobs@board.example',subject:'Data Engineer roles',text:''},apps,jobs),null);
});
test('routes Greenhouse verification mail by its named employer without trusting unrelated mail from that sender',()=>{
  const cloudflare=[{id:'c',jobId:'jc',company:'Cloudflare',role:'Senior Data Engineer',status:'unconfirmed',source:'greenhouse'}];
  const jobs=[{id:'jc',source:'greenhouse',url:'https://boards.greenhouse.io/cloudflare/jobs/8055118'}];
  assert.equal(routeMessage({senderAddress:'no-reply@us.greenhouse-mail.io',subject:'Security code for your application to Cloudflare',text:'Enter the security code.',categories:['Verification']},cloudflare,jobs).applicationId,'c');
  assert.equal(routeMessage({senderAddress:'no-reply@us.greenhouse-mail.io',subject:'Security code for your application',text:'Enter the security code.',categories:['Verification']},cloudflare,jobs),null);
});
test('statuses only move forward, rejection always applies unless already terminal',()=>{
  assert.equal(statusFromMail(['Application confirmation'],'unconfirmed'),'submitted');
  assert.equal(statusFromMail(['Application confirmation'],'interview'),null);
  assert.equal(statusFromMail(['Interview'],'submitted'),'interview');
  assert.equal(statusFromMail(['Screening'],'interview'),null);
  assert.equal(statusFromMail(['Rejection'],'interview'),'rejected');
  assert.equal(statusFromMail(['Interview'],'rejected'),null);
  assert.equal(statusFromMail(['Other'],'submitted'),null);
});
test('routes a recent employer security challenge to the intended unconfirmed application without exposing its code',()=>{
  const state={profile:{email:'apply@example.com'},applications:[{id:'a',jobId:'cloudflare',status:'unconfirmed'}],tasks:[{id:'fill',type:'fill',jobId:'cloudflare',status:'needs_you',stage:'Submission unconfirmed',submitAttemptedAt:'2026-10-06T12:26:22.922Z',checkpoint:{pauseReason:'submission'}}]};
  const mail={id:'message-hash',date:'2026-10-06T12:26:23.000Z',receivedAt:'2026-10-06T12:26:23.000Z',recipients:['apply@example.com'],categories:['Verification'],verificationCode:'CKDOJO',text:'Enter this security code. After you enter the code, resubmit your application.'};
  assert.equal(markVerificationCheckpoint(state,mail,'a'),true);
  assert.equal(state.applications[0].status,'unconfirmed');
  assert.equal(state.tasks[0].stage,'Needs verification');
  assert.equal(state.tasks[0].checkpoint.pauseReason,'verification');
  assert.equal(state.tasks[0].verificationMessageId,'message-hash');
  assert.equal(JSON.stringify(state.tasks[0]).includes('CKDOJO'),false);
  assert.equal(markVerificationCheckpoint(state,mail,'a'),false,'the same message is idempotent');
});
test('does not mark confirmed, user-managed, or pre-submit applications as verification checkpoints',()=>{
  const mail={id:'h',receivedAt:'2026-10-06T12:00:05Z',recipients:['apply@example.com'],categories:['Verification'],verificationCode:'CKDOJO',text:'After you enter the code, resubmit your application.'};
  const state={profile:{email:'apply@example.com'},applications:[{id:'a',jobId:'j',status:'unconfirmed',manuallyUpdated:true}],tasks:[{id:'fill',type:'fill',jobId:'j',submitAttemptedAt:'2026-10-06T12:00:00Z'}]};
  assert.equal(markVerificationCheckpoint(state,mail,'a'),false);
  state.applications[0].manuallyUpdated=false;state.applications[0].status='submitted';
  assert.equal(markVerificationCheckpoint(state,mail,'a'),false);
  state.applications[0].status='unconfirmed';delete state.tasks[0].submitAttemptedAt;
  assert.equal(markVerificationCheckpoint(state,mail,'a'),false);
});

test('requires the application email recipient and a message received after the submit attempt',()=>{
  const state={profile:{email:'apply@example.com'},applications:[{id:'a',jobId:'j',status:'unconfirmed'}],tasks:[{id:'fill',type:'fill',jobId:'j',submitAttemptedAt:'2026-10-06T12:00:00Z'}]};
  const base={id:'mail',categories:['Verification'],verificationCode:'CKDOJO',text:'After you enter the code, resubmit your application.'};
  assert.equal(markVerificationCheckpoint(state,{...base,receivedAt:'2026-10-06T12:00:05Z',recipients:['other@example.com']},'a'),false);
  assert.equal(markVerificationCheckpoint(state,{...base,receivedAt:'2026-10-06T11:59:00Z',recipients:['apply@example.com']},'a'),false);
  assert.equal(markVerificationCheckpoint(state,{...base,receivedAt:'2026-10-06T12:00:05Z',recipients:['apply@example.com']},'a'),true);
});

test('does not route a message addressed to a different application mailbox',()=>{
  const mailbox=[{id:'a',jobId:'j',company:'Cloudflare',role:'Senior Data Engineer',status:'unconfirmed'}];
  const jobs=[{id:'j',url:'https://boards.greenhouse.io/cloudflare/jobs/1'}];
  const mail={senderAddress:'no-reply@us.greenhouse-mail.io',subject:'Security code for your application to Cloudflare',text:'Enter the security code.',categories:['Verification'],recipients:['other@example.com']};
  assert.equal(routeMessage(mail,mailbox,jobs,{expectedRecipient:'apply@example.com'}),null);
});
