import test from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {applicationFormSurface,applicationStep,isWorkdayResumeUploadStep,captureQuestions,applyQuestionAnswers,validateAnswers,waitForApplicationStepChange} from '../application-questions.mjs';
import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();
const live=browser?test:test.skip;
const html=`<body><label id=l>State*</label><button type=button id=b aria-haspopup=listbox aria-labelledby=l>Select One</button><ul id=stale><li role=option>Stale entry (+1)</li></ul><ul id=list hidden></ul><script>
const b=document.getElementById('b'),list=document.getElementById('list');
b.onclick=()=>{list.hidden=false;list.innerHTML='<li role=option>Select One</li>';setTimeout(()=>{list.innerHTML='<li role=option>Select One</li><li role=option>Texas</li><li role=option>Utah</li>';[...list.children].forEach(li=>li.onclick=()=>{b.textContent=li.textContent;list.hidden=true})},400)};
b.onkeydown=e=>{if(e.key==='Escape')list.hidden=true};
</script></body>`;
live('lazy-loaded dropdown options are read after the list settles, without the placeholder',async()=>{
  const page=await browser.newPage();await page.setContent(html);
  const checkpoint=await captureQuestions(page,'My Information');
  const q=checkpoint.questions.find(x=>/State/.test(x.label));
  assert.equal(q.type,'custom');assert.equal(q.manual,false);assert.deepEqual(q.options.map(o=>o.label),['Texas','Utah']);
  const applied=await applyQuestionAnswers(page,checkpoint,{[q.id]:'Texas'});
  assert.deepEqual(applied.errors,{});assert.equal(await page.locator('#b').innerText(),'Texas');await page.close();
});
live('selected Workday custom choices are preserved without reopening dropdowns during rechecks',async()=>{
  const page=await browser.newPage();
  await page.setContent(`<div data-automation-id="formField"><label id="label">Phone Device Type*</label><button id="device" type="button" aria-haspopup="listbox" aria-labelledby="label">Mobile</button><div id="menu" hidden></div><script>window.opens=0;device.onclick=()=>{window.opens++;menu.hidden=false;menu.innerHTML='<div role="option">Mobile</div><div role="option">Home</div>'}</script></div>`);
  const checkpoint=await captureQuestions(page,'My Information');
  const question=checkpoint.questions.find(item=>item.label.includes('Phone Device Type'));
  assert.equal(question.value,'Mobile');
  assert.equal(await page.evaluate(()=>window.opens),0);
  assert.equal(question.manual,false);
  await page.close();
});
live('Workday custom controls verify the selected label instead of the internal option ID',async()=>{
  const page=await browser.newPage();
  await page.route('https://demo.myworkdayjobs.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:`<div data-automation-id="formField"><label id="label">Phone Device Type*</label><button id="device" type="button" value="" aria-haspopup="listbox" aria-labelledby="label">Select One</button><div id="menu" hidden></div><script>device.onclick=()=>{menu.hidden=false;menu.innerHTML='<div role="option">Mobile/Android</div><div role="option">Mobile/Apple iOS</div>';for(const option of menu.children)option.onclick=()=>{device.value=option.textContent==='Mobile/Android'?'32e691ea7c210100c15593a469dd0000':'ios-option-id';device.textContent=option.textContent;menu.hidden=true}}</script>`}));
  await page.goto('https://demo.myworkdayjobs.com/apply');
  const checkpoint=await captureQuestions(page,'My Information');
  const question=checkpoint.questions.find(item=>item.label.includes('Phone Device Type'));
  const applied=await applyQuestionAnswers(page,checkpoint,{[question.id]:'Mobile/Android'});
  assert.deepEqual(applied.errors,{});
  assert.equal(applied.checkpoint.questions.find(item=>item.id===question.id).value,'Mobile/Android');
  assert.equal(await page.locator('#device').getAttribute('value'),'32e691ea7c210100c15593a469dd0000');
  await page.close();
});
live('Workday selected search choices recorded in described-by status are treated as answered',async()=>{
  const page=await browser.newPage();
  await page.route('https://demo.myworkdayjobs.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:`<div data-automation-id="formField"><label for="source">How Did You Hear About Us?*</label><input id="source" placeholder="Search" aria-describedby="source-status"><span id="source-status">1 item selected, Other</span></div>
    <div data-automation-id="formField"><label for="phone">Country Phone Code*</label><input id="phone" placeholder="Search" aria-describedby="phone-status"><span id="phone-status">1 item selected, United States of America (+1)</span></div>`}));
  await page.goto('https://demo.myworkdayjobs.com/apply');
  const checkpoint=await captureQuestions(page,'My Information');
  const source=checkpoint.questions.find(q=>/How Did You Hear/.test(q.label));
  const phone=checkpoint.questions.find(q=>/Country Phone Code/.test(q.label));
  assert.equal(source.value,'Other');
  assert.equal(source.manual,false);
  assert.equal(phone.value,'United States of America (+1)');
  assert.equal(phone.manual,false);
  assert.deepEqual(checkpoint.questions.filter(q=>q.required&&q.value==='').map(q=>q.label),[]);
  await page.close();
});
live('Workday step detection ignores hidden headings from the previous SPA step',async()=>{
  const page=await browser.newPage();
  await page.setContent(`<section hidden><h2>Autofill with Resume</h2></section><section aria-hidden="true"><h2>My Experience</h2></section><h2>My Information</h2><div role="heading">Autofill with Resume</div>`);
  assert.equal(await applicationStep(page),'My Information');
  await page.close();
});
live('Workday step detection prefers the prominent form title over progress tracker labels',async()=>{
  const page=await browser.newPage();
  await page.setContent(`<h2 style="font-size:10px">Autofill with Resume</h2><div style="font-size:24px">My Information</div>`);
  assert.equal(await applicationStep(page),'My Information');
  await page.close();
});
live('Workday resume upload step is recognized as an application form without text inputs',async()=>{
  const page=await browser.newPage();
  await page.setContent(`<h2>Autofill with Resume</h2><p>Upload your resume or CV.</p><button>Continue</button>`);
  assert.equal(await page.locator('input:not([type="hidden"]),textarea,select').count(),0);
  assert.equal(await isWorkdayResumeUploadStep(page),true);
  await page.close();
});
live('Workday form fields inside an iframe are selected for step detection and extraction',async()=>{
  const page=await browser.newPage();
  await page.setContent(`<h2>Autofill with Resume</h2><iframe></iframe>`);
  const frame=page.frames()[1];
  await frame.setContent(`<h2>My Information</h2><label for=email>Email Address*</label><input id=email type=email required>`);
  assert.equal(await applicationStep(page),'My Information');
  const questions=await captureQuestions(page,'My Information');
  assert.equal(questions.questions[0].label,'Email Address*');
  assert.equal(questions.questions[0].required,true);
  await page.close();
});
live('Workday current step detection combines visible cues across the page and its form iframe',async()=>{
  const page=await browser.newPage();
  await page.setContent(`<h2>Autofill with Resume</h2><p>How Did You Hear About Us?*</p><iframe></iframe>`);
  await page.frames()[1].setContent(`<div>Have you ever worked for Mastercard as an employee?</div><input>`);
  assert.equal(await applicationStep(page),'My Information');
  await page.close();
});
live('Workday current form labels override a stale progress-step heading',async()=>{
  const page=await browser.newPage();
  await page.setContent(`<h2 style="font-size:24px">Autofill with Resume</h2><div style="font-size:10px">My Information</div><p>How Did You Hear About Us?*</p><div>Have you ever worked for Mastercard as an employee or provided services as a contingent worker?</div><input>`);
  assert.equal(await applicationStep(page),'My Information');
  await page.close();
});
live('Workday progression waits for a delayed step transition instead of pausing after one second',async()=>{
  const page=await browser.newPage();
  await page.setContent(`<h2 id="step">My Information</h2><script>setTimeout(()=>document.querySelector('#step').textContent='My Experience',1600)</script>`);
  assert.equal(await waitForApplicationStepChange(page,'My Information',{timeoutMs:3000,pollMs:100}),true);
  await page.close();
});
test.after(async()=>{await browser?.close();});

const reactSelect=`<body><label for=c>Country*</label><div class="select__control"><div class="select__value-container"><div class="select__single-value" id=sv></div><input id=c role=combobox aria-autocomplete=list></div></div><div id=menu></div>
<label for=loc>Location (City)*</label><div class="select__control"><div class="select__single-value" id=lsv></div><input id=loc role=combobox></div><div id=lmenu></div><script>
const c=document.getElementById('c'),menu=document.getElementById('menu'),sv=document.getElementById('sv');
c.onmousedown=()=>{menu.innerHTML=['Canada','United States','Mexico'].map(x=>'<div role=option>'+x+'</div>').join('');[...menu.children].forEach(o=>o.onmousedown=()=>{sv.textContent=o.textContent;menu.innerHTML=''})};
c.onkeydown=e=>{if(e.key==='Escape')menu.innerHTML=''};
const loc=document.getElementById('loc'),lmenu=document.getElementById('lmenu'),lsv=document.getElementById('lsv');
loc.oninput=()=>{const v=loc.value.toLowerCase();lmenu.innerHTML=v.length<3?'':['Dayton, Ohio, United States','Daytona Beach, Florida, United States'].filter(x=>x.toLowerCase().startsWith(v)).map(x=>'<div role=option>'+x+'</div>').join('');[...lmenu.children].forEach(o=>o.onmousedown=()=>{lsv.textContent=o.textContent;loc.value='';lmenu.innerHTML=''})};
<\/script></body>`;
live('react-select values are read from the rendered choice and type-ahead fields pick a suggestion',async()=>{
  const page=await browser.newPage();await page.setContent(reactSelect);
  const cp=await captureQuestions(page,'Application');
  const country=cp.questions.find(q=>/Country/.test(q.label)),loc=cp.questions.find(q=>/Location/.test(q.label));
  assert.deepEqual(country.options.map(o=>o.label),['Canada','United States','Mexico']);assert.equal(country.manual,false);
  assert.equal(loc.searchable,true);assert.equal(loc.manual,false);assert.equal(loc.options.length,0);
  const applied=await applyQuestionAnswers(page,cp,{[country.id]:'United States',[loc.id]:'Dayton'});
  assert.deepEqual(applied.errors,{});assert.equal(await page.locator('#sv').innerText(),'United States');assert.equal(await page.locator('#lsv').innerText(),'Dayton, Ohio, United States');
  await page.close();
});

live('Workday searchable dropdowns preserve nested choices and confirmed country phone codes',async()=>{
  const page=await browser.newPage();
  const fixture=`<div data-automation-id=formField><label for=source>How Did You Hear About Us?*</label><input id=source placeholder=Search><div id=sourceValue aria-selected=true></div><div id=sourceMenu></div></div>
<div data-automation-id=formField><label for=phone>Country Phone Code*</label><input id=phone placeholder=Search><div id=phoneValue aria-selected=true></div><div id=phoneMenu></div></div><script>
const source=document.querySelector('#source'),sourceMenu=document.querySelector('#sourceMenu'),sourceValue=document.querySelector('#sourceValue');source.onclick=()=>{sourceMenu.innerHTML='<div role=option>Other</div><div role=option>Referral</div>';[...sourceMenu.children].forEach(o=>o.onclick=()=>{if(o.textContent==='Other'){sourceMenu.innerHTML='<div role=option>Other</div><div role=option>Community group</div>';[...sourceMenu.children].forEach(n=>n.onclick=()=>{sourceValue.textContent=n.textContent;sourceMenu.innerHTML=''})}else{sourceValue.textContent=o.textContent;sourceMenu.innerHTML=''}})};
const phone=document.querySelector('#phone'),phoneMenu=document.querySelector('#phoneMenu'),phoneValue=document.querySelector('#phoneValue');phone.onclick=()=>{phoneMenu.innerHTML='<div role=option>Canada (+1)</div><div role=option>United States of America (+1)</div>';[...phoneMenu.children].forEach(o=>o.onclick=()=>{phoneValue.textContent=o.textContent;phoneMenu.innerHTML=''})};document.addEventListener('keydown',e=>{if(e.key==='Escape'){sourceMenu.innerHTML='';phoneMenu.innerHTML=''}});
</script>`;
  await page.route('https://demo.myworkdayjobs.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:fixture}));
  await page.goto('https://demo.myworkdayjobs.com/apply');
  const cp=await captureQuestions(page,'My Information'),source=cp.questions.find(q=>/How Did You Hear/.test(q.label)),phone=cp.questions.find(q=>/Country Phone Code/.test(q.label));
  assert.equal(source.type,'custom');assert.equal(source.manual,false);assert.ok(source.options.some(o=>o.label==='Other'));
  assert.equal(phone.type,'custom');assert.equal(phone.manual,false);
  const checked=validateAnswers([{...phone,profileCountry:'Dayton, Ohio'}],{[phone.id]:'+1'});assert.deepEqual(checked.errors,{});assert.equal(checked.answers[phone.id],'United States of America (+1)');
  const applied=await applyQuestionAnswers(page,cp,{[source.id]:'Other',[phone.id]:'United States of America (+1)'});
  assert.deepEqual(applied.errors,{});assert.equal(await page.locator('#sourceValue').innerText(),'Other');assert.equal(await page.locator('#phoneValue').innerText(),'United States of America (+1)');await page.close();
});
