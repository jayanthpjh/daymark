import test from 'node:test';import assert from 'node:assert/strict';
import http from 'node:http';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {chromium} from 'playwright';
import {dynamicAdapterFor,enterDynamicApplication,readAdapterCache,updateAdapterCache,adapterTrusted,DYNAMIC_SUBMIT} from '../dynamic-adapter.mjs';

test('unknown career hosts get a dynamic adapter; aggregators do not',()=>{
  assert.equal(dynamicAdapterFor('careers.paramount.com').dynamic,true);
  assert.equal(dynamicAdapterFor('careers.paramount.com').version,1,'dynamic adapters must satisfy adapterSnapshot');
  assert.equal(dynamicAdapterFor('www.linkedin.com'),null);assert.equal(dynamicAdapterFor('jobs.indeed.com'),null);assert.equal(dynamicAdapterFor('localhost'),null);
  assert.ok(DYNAMIC_SUBMIT.test('Submit Application')&&!DYNAMIC_SUBMIT.test('Apply'));
});
test('adapter cache persists per host and trust starts at zero',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-adapters-'));
  assert.equal(await readAdapterCache(dir,'a.example.com'),null);
  const first=await updateAdapterCache(dir,'a.example.com',{entry:{how:'click',applyText:'Apply Now'}});
  assert.equal(adapterTrusted(first),false);
  const second=await updateAdapterCache(dir,'a.example.com',{trust:{submitted:1}});
  assert.equal(second.entry.applyText,'Apply Now');assert.equal(adapterTrusted(await readAdapterCache(dir,'a.example.com')),true);
  await fs.rm(dir,{recursive:true,force:true});
});

const form='<form><input name=first_name><input name=email><input name=phone><button type=button>Submit application</button></form>';
const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');
  if(req.url==='/direct')return res.end(`<h1>Role</h1>${form}`);
  if(req.url==='/posting')return res.end('<h1>Role</h1><p>desc</p><a href="/apply">Apply Now</a>');
  if(req.url==='/popup')return res.end('<h1>Role</h1><a href="/apply" target="_blank">Apply</a>');
  if(req.url==='/apply')return res.end(`<h1>Application</h1>${form}`);
  if(req.url==='/searchy')return res.end('<h1>Careers</h1><input type=search placeholder="Search by keyword"><input name=location placeholder="Search by location"><input name=q aria-label="Filter jobs"><a href="/apply">Apply Now</a>');
  if(req.url==='/methods-posting')return res.end('<h1>Role</h1><button onclick="location.href=\'/methods\'">Apply now</button>');
  if(req.url==='/methods')return res.end('<h1>How would you like to apply?</h1><a href="/linkedin">Apply with LinkedIn</a><a href="/apply">Apply with resume</a>');
  if(req.url==='/alert')return res.end('<h1>Role</h1><form><input name=name><input name=email><input name=location><label><input type=checkbox name=tos>terms</label><button>Send Me Jobs</button></form><p>Continue with email Verify with a one-time code</p>');
  if(req.url==='/none')return res.end('<h1>Closed</h1><a href="/x">Learn more</a>');
  res.statusCode=404;res.end('no')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();
const live=browser?test:test.skip;
live('enters a form directly, via an Apply link, via a popup, and reports none',async()=>{
  for(const [route,how] of [['/direct','direct'],['/posting','click'],['/popup','popup'],['/searchy','click'],['/methods-posting','click'],['/alert','otp'],['/none','none']]){
    const context=await browser.newContext();const page=await context.newPage();await page.goto(base+route);
    const entry=await enterDynamicApplication(page,context,{settleMs:200});
    assert.equal(entry.how,how,route);
    if(!['none','otp'].includes(how))assert.ok(await entry.page.locator('input').count()>=3,route);
    await context.close();
  }
});
live('switches to a known ATS adapter when the apply link lands on one',async()=>{
  const context=await browser.newContext();const page=await context.newPage();await page.goto(base+'/posting');
  const entry=await enterDynamicApplication(page,context,{settleMs:100,detect:()=>({id:'workday'})});
  assert.equal(entry.how,'click');assert.ok(entry.landedHost);await context.close();
});
test.after(async()=>{await browser?.close();server.close();});
