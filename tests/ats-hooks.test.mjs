import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {hooksFor} from '../ats-hooks.mjs';
import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();
const live=browser?test:test.skip;
after(async()=>{await browser?.close();});

// Pins what server.mjs did with `adapter.id==='workday'` before the branches became hooks.
const ids=['workday','greenhouse','lever','ashby','smartrecruiters','icims','avature','successfactors','dynamic'];
test('workday keeps its special behavior; every other ATS keeps the default',()=>{
  const wd=hooksFor({id:'workday'});
  assert.deepEqual({accountEntry:wd.accountEntry,skipFullName:wd.skipFullName,genericSignIn:wd.genericSignIn,probesNextStep:wd.probesNextStep,keepsRequisitionOnReopen:wd.keepsRequisitionOnReopen},{accountEntry:true,skipFullName:true,genericSignIn:false,probesNextStep:false,keepsRequisitionOnReopen:true});
  for(const id of ids.filter(x=>x!=='workday')){
    const h=hooksFor({id});
    assert.deepEqual({accountEntry:h.accountEntry,skipFullName:h.skipFullName,genericSignIn:h.genericSignIn,probesNextStep:h.probesNextStep,keepsRequisitionOnReopen:h.keepsRequisitionOnReopen},{accountEntry:false,skipFullName:false,genericSignIn:true,probesNextStep:true,keepsRequisitionOnReopen:false},id);
  }
});
test('a missing adapter gets the default hooks',()=>{assert.equal(hooksFor(null).genericSignIn,true);assert.equal(hooksFor(undefined).accountEntry,false);});
test('hooks are frozen so a caller cannot change them',()=>{assert.throws(()=>{'use strict';hooksFor({id:'workday'}).accountEntry=false;});});

const reviewPage='<body><h2 role="heading">Review</h2><button>Submit</button></body>';
const uploadPage='<body><h2>Autofill with Resume</h2><div>Select file</div><input type=file style="display:none"><button>Continue</button></body>';
const plain='<body><h2>My Information</h2><input></body>';
live('workday detects its Review step and upload step; other ATSs never claim a review or an upload step',async()=>{
  const page=await browser.newPage();
  const wd=hooksFor({id:'workday'}),gh=hooksFor({id:'greenhouse'});
  await page.setContent(reviewPage);
  assert.equal(await wd.reviewDetected(page),true);assert.equal(await wd.finalReviewReady(page),true);
  assert.equal(await gh.reviewDetected(page),false,'a non-Workday page is never "finished" because of a Review heading');
  assert.equal(await gh.finalReviewReady(page),true,'default is ready: only Workday gates on the Review heading');
  await page.setContent(plain);
  assert.equal(await wd.reviewDetected(page),false);assert.equal(await wd.finalReviewReady(page),false);
  await page.setContent(uploadPage);
  assert.equal(await wd.resumeUploadStep(page),true);assert.equal(await gh.resumeUploadStep(page),false);
  await page.close();
});
live('workday attaches the resume through its Select file chooser; the default does nothing',async()=>{
  const page=await browser.newPage();
  await page.setContent('<body><h2>Autofill with Resume</h2><div id=s>Select file</div><input id=f type=file hidden><script>s.onclick=()=>f.click();f.onchange=()=>{document.title=f.files[0].name}</script><button>Continue</button></body>');
  const path=new URL('../package.json',import.meta.url).pathname;
  assert.equal(await hooksFor({id:'greenhouse'}).selectResumeFile(page,page,path),false);
  assert.equal(await hooksFor({id:'workday'}).selectResumeFile(page,page,path),true);
  assert.equal(await page.title(),'package.json');
  await page.close();
});
