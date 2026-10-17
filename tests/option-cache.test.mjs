import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {captureQuestions,applyQuestionAnswers,optionCacheKey} from '../application-questions.mjs';
import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();
const live=browser?test:test.skip;
after(async()=>{await browser?.close();});
const html=`<body><label id=l>State*</label><button type=button id=b aria-haspopup=listbox aria-labelledby=l>Select One</button><ul id=list role=listbox hidden></ul>
<script>window.opens=0;window.opts=['Texas','Utah'];
const b=document.getElementById('b'),list=document.getElementById('list');
b.onclick=()=>{window.opens++;list.hidden=false;list.innerHTML=window.opts.map(o=>'<li role=option>'+o+'</li>').join('');};
b.onkeydown=e=>{if(e.key==='Escape')list.hidden=true};
list.onclick=e=>{if(e.target.getAttribute('role')==='option'){b.textContent=e.target.textContent;list.hidden=true}};
</script></body>`;
const state=question=>question.options.map(o=>o.label);

live('a dropdown is opened once per task, not on every capture',async()=>{
  const page=await browser.newPage();await page.setContent(html);
  const optionCache=new Map();
  const first=await captureQuestions(page,'My Information',{optionCache});
  const q=first.questions.find(x=>/State/.test(x.label));
  assert.deepEqual(state(q),['Texas','Utah']);assert.equal(await page.evaluate(()=>window.opens),1);
  const second=await captureQuestions(page,'My Information',{optionCache});
  assert.equal(await page.evaluate(()=>window.opens),1,'the second capture reused the cached options');
  assert.deepEqual(state(second.questions.find(x=>/State/.test(x.label))),['Texas','Utah']);
  assert.equal(second.signature,first.signature,'the checkpoint signature is unchanged by the cache');
  await captureQuestions(page,'My Information');
  assert.equal(await page.evaluate(()=>window.opens),2,'without a cache every capture reopens the list');
  await page.close();
});
live('the cache is scoped to host, step and control',async()=>{
  const page=await browser.newPage();await page.setContent(html);
  const optionCache=new Map();
  await captureQuestions(page,'My Information',{optionCache});
  await captureQuestions(page,'Application Questions',{optionCache});
  assert.equal(await page.evaluate(()=>window.opens),2,'another step is a different entry');
  assert.equal(optionCache.size,2);
  await page.close();
});
live('a failed apply drops the entry, so a changed list is read again',async()=>{
  const page=await browser.newPage();await page.setContent(html);
  const optionCache=new Map();
  const checkpoint=await captureQuestions(page,'My Information',{optionCache});
  const q=checkpoint.questions.find(x=>/State/.test(x.label));
  await page.evaluate(()=>{window.opts=['Utah','Vermont'];});
  const applied=await applyQuestionAnswers(page,checkpoint,{[q.id]:'Texas'},{optionCache});
  assert.ok(applied.errors[q.id]||applied.stale,'Texas is no longer offered, so the answer is not accepted');
  assert.equal(optionCache.has(optionCacheKey(page,'My Information',q)),false,'the stale entry is gone');
  const fresh=await captureQuestions(page,'My Information',{optionCache});
  assert.deepEqual(state(fresh.questions.find(x=>/State/.test(x.label))),['Utah','Vermont']);
  await page.close();
});
