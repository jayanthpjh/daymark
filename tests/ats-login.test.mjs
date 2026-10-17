import test from 'node:test';import assert from 'node:assert/strict';
import {signInATS,atsLoginScope} from '../ats-login.mjs';import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();const live=browser?test:test.skip;
const login=`<form><input type=email><input type=password autocomplete=current-password><button type=button onclick="window.clicks=(window.clicks||0)+1;document.body.innerHTML='<button aria-label=Account>Account</button>'">Sign in</button></form>`;
async function pageFor(html){const p=await browser.newPage();await p.route('https://ats.example/**',r=>r.fulfill({body:html,contentType:'text/html'}));await p.goto('https://ats.example/login');return p;}
const options=extra=>({host:'ats.example',credentials:{username:'alex@example.test',password:'fake-password'},saveAccount:async()=>{},assertActive:async()=>{},wait:async()=>{},...extra});
live('logs in once, persists attempt before click and confirms account surface',async()=>{
 const page=await pageFor(login);let recorded;
 await signInATS(page,options({saveAccount:async a=>{if(!recorded){assert.equal(await page.evaluate(()=>window.clicks||0),0);recorded=a;}}}));
 assert.ok(recorded.loginAttemptAt);assert.equal(await page.evaluate(()=>window.clicks),1);await page.close();
});
live('does not repeat a rejected login, fill registration or cross the scoped host',async()=>{
 for(const [html,extra] of [[login,{account:{loginAttemptAt:'now'}}],[login.replace('current-password','new-password'),{}],[login,{host:'other.example'}],[login.replace('</form>','<input type=checkbox></form>'),{}]]){
  const page=await pageFor(html);await assert.rejects(signInATS(page,options(extra)));assert.equal(await page.locator('input[type=password]').inputValue(),'');assert.equal(await page.evaluate(()=>window.clicks||0),0);await page.close();
 }
});
live('uses matched verification code once and confirms login without sending application',async()=>{
 const html=`<form><input type=email><input type=password><button type=button id=sign>Sign in</button></form><script>
 sign.onclick=()=>{window.clicks=1;document.body.innerHTML='<form><input autocomplete=one-time-code><button type=button id=verify>Verify code</button></form>';verify.onclick=()=>{window.verifies=1;document.body.innerHTML='<button aria-label=Account>Account</button>'}};
 </script>`;
 const page=await pageFor(html);let queries=0;
 await signInATS(page,options({findCode:async()=>{queries++;return '123456';}}));
 assert.equal(queries,1);assert.equal(await page.evaluate(()=>window.clicks),1);assert.equal(await page.evaluate(()=>window.verifies),1);await page.close();
});
live('missing verification mail pauses instead of repeating sign-in',async()=>{
 const html=login.replace("document.body.innerHTML='<button aria-label=Account>Account</button>'","document.body.innerHTML='<form><input autocomplete=one-time-code><button type=button>Verify code</button></form>'");
 const page=await pageFor(html);let queries=0;
 await assert.rejects(signInATS(page,options({findCode:async()=>{queries++;return null;}})),/waiting for employer verification/);
 assert.equal(queries,30);assert.equal(await page.evaluate(()=>window.clicks),1);await page.close();
});
test.after(async()=>browser?.close());
live('successful login clears attempt guards for a future expired session',async()=>{
 const page=await pageFor(login);let saved;
 await signInATS(page,options({saveAccount:async a=>saved=a}));
 assert.equal(saved.status,'active');assert.equal(saved.loginAttemptAt,null);assert.equal(saved.codeAttemptAt,null);await page.close();
});

test('generic login scope supports non-Workday ATS hosts and excludes token URLs',()=>{
 assert.equal(atsLoginScope('https://boards.greenhouse.io/login?token=secret','Alex@Example.test'),'ats:boards.greenhouse.io/alex@example.test');
 assert.throws(()=>atsLoginScope('http://boards.greenhouse.io/login','a'));
 assert.throws(()=>atsLoginScope('https://user:pass@boards.greenhouse.io/login','a'));
});

live('waits for delayed mail and fills before checking the verify control',async()=>{
 const page=await pageFor(`<form><input autocomplete=one-time-code oninput="document.getElementById('verify').disabled=false"><button id=verify type=button disabled onclick="document.body.innerHTML=&quot;<button aria-label=Account>Account</button>&quot;">Verify code</button></form>`);
 let queries=0;
 await signInATS(page,options({findCode:async()=>++queries<3?null:'123456'}));
 assert.equal(queries,3);assert.equal(await page.getByRole('button',{name:'Account'}).count(),1);await page.close();
});
