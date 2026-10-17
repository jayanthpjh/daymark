import test from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {looksSubmitted,mergeFilledStep,canAutoApprove,submitApplicationPage,submitButtonPattern} from '../submit-flow.mjs';

test('confirmation detection needs real receipt text or url',()=>{
  assert.equal(looksSubmitted('Thank you for applying to Acme','https://x.com/apply'),true);
  assert.equal(looksSubmitted('Please complete all fields','https://x.com/apply'),false);
  assert.equal(looksSubmitted('','https://boards.greenhouse.io/acme/jobs/1/confirmation'),true);
});
test('filled steps drop passwords, selectors and empty values',()=>{
  const steps=mergeFilledStep([],'My Information',[{label:'Country*',value:'United States',type:'select',selector:'[x]'},{label:'Password',value:'secret',type:'password'},{label:'Phone',value:''}]);
  assert.deepEqual(steps,[{step:'My Information',answers:[{label:'Country',value:'United States',required:false,source:''}]}]);
  assert.equal(mergeFilledStep(steps,'My Information',[]).length,1);
});
test('auto approval requires documents and unchanged protected facts',()=>{
  assert.equal(canAutoApprove({resume:'r',resumePdf:'p'},[]).ok,true);
  assert.equal(canAutoApprove({resume:'r',resumePdf:'p'},['Acme 2020']).ok,false);
  assert.equal(canAutoApprove({},[]).ok,false);
  assert.ok(submitButtonPattern('workday')&&!submitButtonPattern('unknown'));
});

import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();
const live=browser?test:test.skip;
const form=(extra='')=>`<body><form id=f><input name=q>${extra}<button type=button id=b onclick="window.clicks=(window.clicks||0)+1;document.body.innerHTML='<h1>Thank you for applying</h1>'">Submit application</button></form></body>`;
live('submits once and detects confirmation',async()=>{
  const page=await browser.newPage();await page.setContent(form());let recorded=0;
  const result=await submitApplicationPage(page,'greenhouse',{beforeClick:()=>{recorded++},confirmTimeoutMs:5000});
  assert.equal(result.status,'submitted');assert.equal(recorded,1);assert.equal(await page.evaluate(()=>window.clicks),1);await page.close();
});
live('blocks on captcha, validation, missing and duplicate buttons without clicking',async()=>{
  for(const [html,expect] of [[form('<div class="g-recaptcha" style="width:300px;height:80px">Verify</div>'),/CAPTCHA/],[form('<p role="alert">Required</p>'),/validation/],['<body><button>Save draft</button></body>',/not found/],[form()+'<button>Submit application</button>',/More than one/]]){
    const page=await browser.newPage();await page.setContent(html);let recorded=0;
    const result=await submitApplicationPage(page,'greenhouse',{beforeClick:()=>{recorded++},confirmTimeoutMs:500});
    assert.equal(result.status,'blocked');assert.match(result.reason,expect);assert.equal(recorded,0);assert.ok(!await page.evaluate(()=>window.clicks));await page.close();
  }
});
live('reports unconfirmed when the page shows no receipt',async()=>{
  const page=await browser.newPage();await page.setContent('<body><button onclick="window.clicks=1">Submit application</button></body>');
  const result=await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:1500});
  assert.equal(result.status,'unconfirmed');assert.equal(await page.evaluate(()=>window.clicks),1);await page.close();
});
test.after(async()=>{await browser?.close();});
live('required fields block; old thank-you text is not a new receipt; employer rejection is explicit',async()=>{
 const page=await browser.newPage();await page.setContent(form('<input required aria-label="Postal code">'));
 assert.equal((await submitApplicationPage(page,'greenhouse')).status,'blocked');assert.ok(!await page.evaluate(()=>window.clicks));
 await page.setContent('<p>Thank you for applying</p><button onclick="window.clicks=1">Submit application</button>');
 assert.equal((await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:800})).status,'unconfirmed');
 await page.setContent('<button onclick="document.body.insertAdjacentHTML(\'beforeend\',\'<p role=alert>Invalid answer</p>\')">Submit application</button>');
 assert.equal((await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:1500})).status,'rejected');await page.close();
});
live('implicit submission attestations require manual resolution',async()=>{const page=await browser.newPage();await page.setContent(form('<p>By submitting this application, I certify all statements are accurate.</p>'));let clicks=0;const result=await submitApplicationPage(page,'greenhouse',{beforeClick:()=>clicks++});assert.equal(result.status,'blocked');assert.match(result.reason,/attestation/);assert.equal(clicks,0);await page.close();});
live('an invisible CAPTCHA badge alone does not pretend a manual challenge is present',async()=>{const page=await browser.newPage();await page.setContent(form('<div class="g-recaptcha" data-size="invisible"><iframe src="https://captcha.example.test/recaptcha/anchor" style="display:none"></iframe></div>'));assert.equal((await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:1500})).status,'submitted');await page.close();});
live('a Submit control inside an iframe is found, clicked once and its confirmation is detected',async()=>{
  const page=await browser.newPage();
  const inner=`<body><form><input name=q><button type=button id=b onclick="window.clicks=(window.clicks||0)+1;document.body.innerHTML='<h1>Thank you for applying</h1>'">Submit application</button></form></body>`;
  await page.setContent(`<body><h1>Careers</h1><iframe id=app srcdoc="${inner.replace(/"/g,'&quot;')}"></iframe></body>`);
  await page.frames()[1].waitForSelector('#b');
  let recorded=0;
  const result=await submitApplicationPage(page,'greenhouse',{beforeClick:()=>{recorded++},confirmTimeoutMs:5000});
  assert.equal(result.status,'submitted');assert.equal(recorded,1);
  assert.equal(await page.frames()[1].evaluate(()=>window.clicks),1);await page.close();
});
live('two Submit controls across frames are ambiguous and nothing is clicked',async()=>{
  const page=await browser.newPage();
  const inner=`<body><button type=button onclick="window.clicks=1">Submit application</button></body>`;
  await page.setContent(`<body><button type=button onclick="window.clicks=1">Submit application</button><iframe srcdoc="${inner.replace(/"/g,'&quot;')}"></iframe></body>`);
  await page.frames()[1].waitForSelector('button');
  const result=await submitApplicationPage(page,'greenhouse',{beforeClick:()=>{throw new Error('must not record')},confirmTimeoutMs:1000});
  assert.equal(result.status,'blocked');await page.close();
});
const codeForm=`<body><div id=root><form><input name=q><button type=button id=b>Submit application</button></form></div><script>
b.onclick=()=>{window.clicks=(window.clicks||0)+1;root.innerHTML='<div><label>Security code</label>'+[...Array(8)].map((_,i)=>'<input id=security_input_'+i+' maxlength=1>').join('')+'<button type=button id=v>Submit</button></div>';
v.onclick=()=>{window.verifies=(window.verifies||0)+1;const code=[...Array(8)].map((_,i)=>document.getElementById('security_input_'+i).value).join('');document.body.innerHTML=code==='aB3dE5gH'?'<h1>Thank you for applying</h1>':'<p>That code is not right</p>'}};
</script></body>`;
live('a Greenhouse security code is filled once from the matched email and the application is confirmed',async()=>{
  const page=await browser.newPage();await page.setContent(codeForm);let asked=0;const events=[];
  const result=await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:6000,onVerificationEvent:async event=>events.push(event.stage),onSecurityCode:async()=>{asked++;return 'aB3dE5gH';}});
  assert.deepEqual(events,['challenge_detected','waiting_for_code','code_found','verification_attempted','verification_confirmed']);
  assert.equal(result.status,'submitted');assert.equal(asked,1);await page.close();
});
live('a wrong security code is not retried and ends in an explicit user checkpoint',async()=>{
  const page=await browser.newPage();await page.setContent(codeForm);let asked=0;
  const result=await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:2500,onSecurityCode:async()=>{asked++;return 'zzzzzzzz';}});
  assert.equal(asked,1);assert.equal(result.status,'unconfirmed');
  assert.equal(await page.evaluate(()=>window.verifies||0),1,'the verify control is clicked at most once');await page.close();
});
live('with no matching email or no mail hook the security code step stops immediately without a second click',async()=>{
  for(const hooks of [{onSecurityCode:async()=>null},{}]){
    const page=await browser.newPage();await page.setContent(codeForm);
    const result=await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:4000,...hooks});
    assert.equal(result.status,'unconfirmed');assert.match(result.reason,/security code/i);
    assert.equal(await page.evaluate(()=>window.clicks||0),1);assert.equal(await page.evaluate(()=>window.verifies||0),0);await page.close();
  }
});

live('current Greenhouse hyphenated security inputs are detected and verified once',async()=>{
 const page=await browser.newPage();const events=[];let codeReads=0;
 await page.setContent(`<button id=start onclick="window.initialClicks=(window.initialClicks||0)+1;document.body.innerHTML='<fieldset id=email-verification><legend>Enter your security code</legend>'+Array.from({length:8},(_,i)=>'<input id=security-input-'+i+' maxlength=1>').join('')+'</fieldset><button onclick=verifyCode()>Submit application</button>'">Submit application</button><script>function verifyCode(){window.verifyClicks=(window.verifyClicks||0)+1;const value=Array.from({length:8},(_,i)=>document.getElementById('security-input-'+i).value).join('');if(value==='aB3dE5gH')document.body.innerHTML='<h1>Thank you for applying</h1>';}</script>`);
 const result=await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:1600,onVerificationEvent:async e=>events.push(e.stage),onSecurityCode:async()=>{codeReads++;return 'aB3dE5gH';}});
 assert.equal(result.status,'submitted');assert.equal(codeReads,1);assert.equal(await page.evaluate(()=>window.initialClicks),1);assert.equal(await page.evaluate(()=>window.verifyClicks),1);assert.ok(events.includes('verification_confirmed'));await page.close();
});

live('code verification waits for a delayed employer receipt without clicking twice',async()=>{
 const page=await browser.newPage();let reads=0;
 await page.setContent(`<button id=start onclick="window.initialClicks=(window.initialClicks||0)+1;document.body.innerHTML=Array.from({length:8},(_,i)=>'<input id=security-input-'+i+' maxlength=1>').join('')+'<button onclick=verifyCode()>Submit application</button>'">Submit application</button><script>function verifyCode(){window.verifyClicks=(window.verifyClicks||0)+1;setTimeout(()=>document.body.innerHTML='<h1>Thank you for applying</h1>',2400);}</script>`);
 const result=await submitApplicationPage(page,'greenhouse',{confirmTimeoutMs:5000,onSecurityCode:async()=>{reads++;return 'aB3dE5gH';}});
 assert.equal(result.status,'submitted');assert.equal(reads,1);assert.equal(await page.evaluate(()=>window.verifyClicks),1);await page.close();
});
