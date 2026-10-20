import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {signInATS} from '../ats-login.mjs';
import {signInProfileFor,findAuthMessage} from '../ats-auth.mjs';
import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();const live=browser?test:test.skip;
after(async()=>{await browser?.close();});
const pageFor=async html=>{const p=await browser.newPage();await p.route('https://ats.example/**',r=>r.fulfill({body:html,contentType:'text/html'}));await p.goto('https://ats.example/jobs/1');return p;};
const options=extra=>({host:'ats.example',credentials:{username:'alex@example.test',password:'fake-password'},saveAccount:async()=>{},assertActive:async()=>{},wait:async()=>{},...extra});
const signedIn="document.body.innerHTML='<button aria-label=Account>Account</button>'";

// iCIMS-style: the posting only has a "Log In" link; the email is asked first, then the password on its own screen.
const icims=`<body><h1>Data Engineer</h1><a href="#" id=lnk>Log In</a><script>
lnk.onclick=e=>{e.preventDefault();window.entry=(window.entry||0)+1;document.body.innerHTML='<h2>Log in</h2><input type=email name=loginName><button type=button id=next>Next</button>';
next.onclick=()=>{window.emails=document.querySelector('[name=loginName]').value;document.body.innerHTML='<form><input type=password><button type=button id=go>Log In</button></form>';
go.onclick=()=>{window.logins=(window.logins||0)+1;${signedIn}}}}</script></body>`;
live('iCIMS-style: opens the Log In link, sends the email first, then the password, once',async()=>{
  const page=await pageFor(icims);let saved;
  await signInATS(page,options({profile:signInProfileFor('icims'),saveAccount:async a=>{saved=a;}}));
  assert.equal(await page.evaluate(()=>window.entry),1);assert.equal(await page.evaluate(()=>window.emails),'alex@example.test');assert.equal(await page.evaluate(()=>window.logins),1);
  assert.equal(saved.status,'active');await page.close();
});
live('identifier-first never submits when the next screen is not a password',async()=>{
  const page=await pageFor(icims.replace("<form><input type=password><button type=button id=go>Log In</button></form>","<p>We emailed you a link.</p>"));
  await assert.rejects(signInATS(page,options({profile:signInProfileFor('icims')})),/did not ask for a password/);
  assert.equal(await page.evaluate(()=>window.logins||0),0);await page.close();
});
live('identifier-first needs a login: without one it pauses before typing anything',async()=>{
  const page=await pageFor(icims);
  await assert.rejects(signInATS(page,options({profile:signInProfileFor('icims'),credentials:null})),/Add your application email and an ATS password/);
  assert.equal(await page.evaluate(()=>window.emails||''),'');await page.close();
});

// SuccessFactors-style: j_username with a "Log In" button; Avature-style: login/username names with "Sign In".
const sf=`<form><label>Username <input name=j_username></label><label>Password <input type=password name=j_password></label><button type=button id=b>Log In</button></form><script>b.onclick=()=>{window.logins=(window.logins||0)+1;${signedIn}}</script>`;
const avature=`<form><input name=login_id><input type=password><button type=button id=b>Sign In</button></form><script>b.onclick=()=>{window.logins=(window.logins||0)+1;${signedIn}}</script>`;
for(const [id,html] of [['successfactors',sf],['avature',avature]])live(`${id}-style: signs in once with its own username field`,async()=>{
  const page=await pageFor(html);
  await signInATS(page,options({profile:signInProfileFor(id)}));
  assert.equal(await page.evaluate(()=>window.logins),1);await page.close();
});
live('a profile does not loosen the safety checks: registration, extra checkboxes and a prior attempt still stop',async()=>{
  for(const [html,extra] of [[sf.replace('type=password','type=password autocomplete=new-password'),{}],[sf.replace('</form>','<input type=checkbox></form>'),{}],[sf,{account:{loginAttemptAt:'now'}}]]){
    const page=await pageFor(html);
    await assert.rejects(signInATS(page,options({profile:signInProfileFor('successfactors'),...extra})));
    assert.equal(await page.evaluate(()=>window.logins||0),0);await page.close();
  }
});
live('the posting link is not clicked on a verification screen',async()=>{
  const page=await pageFor(`<a href="#" id=a onclick="window.hit=1">Log In</a><form><input autocomplete=one-time-code><button type=button>Verify code</button></form>`);
  await assert.rejects(signInATS(page,options({profile:signInProfileFor('icims'),findCode:async()=>null})));
  assert.equal(await page.evaluate(()=>window.hit||0),0);await page.close();
});
const registration=`<body><h1>Create Account</h1><form><label>First name <input name=firstName autocomplete=given-name></label><label>Last name <input name=lastName autocomplete=family-name></label><label>Email <input type=email name=email></label><label>Password <input type=password autocomplete=new-password></label><label>Confirm password <input type=password></label><button type=button id=create>Create Account</button></form><script>create.onclick=()=>{window.created={first:document.querySelector('[name=firstName]').value,last:document.querySelector('[name=lastName]').value,email:document.querySelector('[type=email]').value,passwordFields:[...document.querySelectorAll('[type=password]')].map(x=>x.value)};document.body.innerHTML='<button aria-label=Account>Account</button>'}</script></body>`;
live('creates a supported ATS account once from a clearly labeled form using saved credentials',async()=>{
  const page=await pageFor(registration);const saved=[];
  await signInATS(page,options({profile:{...signInProfileFor('icims'),firstName:'Alex',lastName:'Example'},saveAccount:async value=>saved.push(value)}));
  assert.deepEqual(await page.evaluate(()=>window.created),{first:'Alex',last:'Example',email:'alex@example.test',passwordFields:['fake-password','fake-password']});
  assert.ok(saved.some(value=>value.registrationAttemptAt));assert.equal(saved.at(-1).status,'active');await page.close();
});
live('registration pauses before terms or consent and never checks them automatically',async()=>{
  const page=await pageFor(registration.replace('<button type=button id=create>','<label><input type=checkbox name=terms>I agree to the employer terms</label><button type=button id=create>'));
  await assert.rejects(signInATS(page,options({profile:{...signInProfileFor('icims'),firstName:'Alex',lastName:'Example'}})),/needs your review/i);
  assert.equal(await page.locator('[type=checkbox]').isChecked().catch(()=>false),false);assert.equal(await page.evaluate(()=>window.created),undefined);await page.close();
});
live('an uncertain registration attempt is never submitted a second time',async()=>{
  const page=await pageFor(registration);
  await assert.rejects(signInATS(page,options({account:{registrationAttemptAt:new Date().toISOString()},profile:{...signInProfileFor('icims'),firstName:'Alex',lastName:'Example'}})),/already started/i);
  assert.equal(await page.evaluate(()=>window.created),undefined);await page.close();
});

test('only the three listed ATSs have sign-in profiles, and they cannot be edited',()=>{
  assert.ok(signInProfileFor('icims').identifierFirst);assert.equal(signInProfileFor('avature').identifierFirst,false);
  assert.equal(signInProfileFor('greenhouse'),null);assert.equal(signInProfileFor('__proto__'),null);assert.equal(signInProfileFor(undefined),null);
  assert.throws(()=>{'use strict';signInProfileFor('icims').identifierFirst=false;});
});
test('verification codes from each ATS sender are found, and look-alike senders are not',()=>{
  const now=Date.now();
  const mail=(sender,host)=>[{id:'m1',receivedAt:new Date(now-1000).toISOString(),recipients:['alex@example.test'],senderAddress:sender,subject:'Your verification code',text:'Your verification code is 482913. Northwind Analytics'}];
  for(const [host,sender] of [['careers-northwind.icims.com','no-reply@icims.com'],['northwind.avature.net','noreply@avature.net'],['career5.successfactors.com','noreply@successfactors.com']]){
    const found=findAuthMessage(mail(sender),{email:'alex@example.test',applicationUrl:`https://${host}/apply`,company:'Northwind Analytics',purpose:'verify',since:now-60000});
    assert.equal(found?.code,'482913',host);
    assert.equal(findAuthMessage(mail('noreply@icims.com.evil.test'),{email:'alex@example.test',applicationUrl:`https://${host}/apply`,company:'Northwind Analytics',purpose:'verify',since:now-60000}),null,`look-alike for ${host}`);
  }
});
