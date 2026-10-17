import test,{after} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureQuestions,applyQuestionAnswers,normalizeForCompare,sameAnswer} from '../application-questions.mjs';
import {resolveAnswers} from '../answer-engine.mjs';
import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();
const live=browser?test:test.skip;
after(async()=>{await browser?.close();});
const fixture=name=>fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures/ats',name),'utf8');
const profile={name:'Alex Doe',firstName:'Alex',lastName:'Doe',email:'alex@example.com',phone:'+1 555-555-0100',linkedin:'https://linkedin.com/in/alex',city:'Austin',state:'TX',country:'United States'};
const pack={values:{authorization_us:'Yes',relocation:'Yes'}};
async function open(name){const page=await browser.newPage();await page.setContent(fixture(name));return page;}
const byLabel=(checkpoint,pattern)=>checkpoint.questions.find(q=>pattern.test(q.label));

test('masked and formatted values compare as the same answer',()=>{
  assert.equal(sameAnswer({label:'Phone',type:'tel'},'(555) 555-0100','+1 555-555-0100'),true);
  assert.equal(sameAnswer({label:'Desired salary',type:'text'},'$120,000','120000'),true);
  assert.equal(sameAnswer({label:'Skills',type:'custom'},['SQL','Python'],['python','sql']),true);
  assert.equal(sameAnswer({label:'First name',type:'text'},'Alex','Alexa'),false);
  assert.equal(sameAnswer({label:'Country',type:'custom'},'+1','United States +1'),true,'dropdown shows the short form of the chosen option');
  assert.equal(sameAnswer({label:'Worked here?',type:'custom'},'No','Not sure'),false,'whole words only');
  assert.equal(sameAnswer({label:'Notes',type:'text'},'+1','United States +1'),false,'plain text fields stay strict');
  assert.equal(normalizeForCompare({label:'City',type:'text'},'  Austin  '),'austin');
});

live('Greenhouse-style markup: labels, required flags and unlabeled required fields are all detected',async()=>{
  const page=await open('greenhouse-classic.html');
  const checkpoint=await captureQuestions(page,'Application');
  const labels=checkpoint.questions.map(q=>q.label);
  assert.ok(labels.includes('LinkedIn Profile'),`sibling-div labels are found: ${labels}`);
  assert.ok(labels.includes('Cover letter'),'contenteditable editors are captured');
  assert.equal(byLabel(checkpoint,/^First Name/).required,true,'asterisk span marks first name required');
  assert.equal(byLabel(checkpoint,/^Last Name/).required,true,'"(required)" text marks last name required');
  assert.equal(byLabel(checkpoint,/^Email/).required,true,'native required attribute');
  assert.equal(byLabel(checkpoint,/LinkedIn/).required,false);
  const auth=byLabel(checkpoint,/authorized to work/i);
  assert.equal(auth.type,'radio');assert.equal(auth.required,true);assert.deepEqual(auth.options.map(o=>o.label),['Yes','No']);
  const unlabeled=byLabel(checkpoint,/Unlabeled required/);
  assert.ok(unlabeled,'a required control with no label is surfaced rather than dropped');
  await page.close();
});

live('Greenhouse-style form is filled from profile, radio and masked phone are retained, contenteditable accepts text',async()=>{
  const page=await open('greenhouse-classic.html');
  const checkpoint=await captureQuestions(page,'Application');
  const resolved=resolveAnswers(checkpoint.questions,{profile,email:profile.email,pack});
  const answers={...resolved.answers};
  const cover=byLabel(checkpoint,/Cover letter/);answers[cover.id]='I am excited to apply.';
  const applied=await applyQuestionAnswers(page,checkpoint,answers);
  assert.deepEqual(applied.errors,{},'the formatted phone is not reported as unretained');
  assert.equal(await page.locator('#first_name').inputValue(),'Alex');
  assert.equal(await page.locator('#phone').inputValue(),'(555) 555-0100');
  assert.equal(await page.locator('input[name=question_1002][value="1"]').isChecked(),true);
  assert.equal((await page.locator('#cover').innerText()).trim(),'I am excited to apply.');
  await page.close();
});

live('Ashby-style yes/no toggle buttons are captured as one radio question and can be answered',async()=>{
  const page=await open('ashby-toggle.html');
  const checkpoint=await captureQuestions(page,'Application');
  const relocation=byLabel(checkpoint,/relocation/i);
  assert.ok(relocation,'toggle buttons become a question');
  assert.equal(relocation.type,'radio');assert.equal(relocation.required,true);
  assert.deepEqual(relocation.options.map(o=>o.label),['Yes','No']);
  const resolved=resolveAnswers(checkpoint.questions,{profile,email:profile.email,pack});
  assert.equal(resolved.answers[relocation.id],'Yes');
  const applied=await applyQuestionAnswers(page,checkpoint,resolved.answers);
  assert.deepEqual(applied.errors,{});
  assert.equal(await page.locator('#yes').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#no').getAttribute('aria-pressed'),'false');
  await page.close();
});

live('React-Select multi-select keeps existing tags and adds only the missing choices',async()=>{
  const page=await open('react-select-multi.html');
  const checkpoint=await captureQuestions(page,'Application');
  const skills=byLabel(checkpoint,/Skills/);
  assert.equal(skills.multi,true);assert.deepEqual(skills.value,['Python']);
  const applied=await applyQuestionAnswers(page,checkpoint,{[skills.id]:['Python','SQL']});
  assert.deepEqual(applied.errors,{});
  const tags=await page.locator('.select__multi-value__label').allTextContents();
  assert.deepEqual(tags.sort(),['Python','SQL']);
  await page.close();
});

live('with several file inputs the resume field is chosen, never cover letter or transcript',async()=>{
  const {resumeFileInput}=await import('../application-questions.mjs');
  const page=await open('multi-upload.html');
  assert.equal(await (await resumeFileInput(page)).getAttribute('id'),'rs');
  await page.setContent('<input id=only type=file>');
  assert.equal(await (await resumeFileInput(page)).getAttribute('id'),'only');
  await page.setContent('<label>Cover letter <input id=a type=file></label><label>Anything else <input id=b type=file></label>');
  assert.equal(await (await resumeFileInput(page)).getAttribute('id'),'b','falls back to the first non-cover-letter input');
  await page.close();
});

live('hidden required shims are ignored and an invisible reCAPTCHA badge is not treated as a challenge',async()=>{
  const {authPreflightScreen}=await import('../ats-auth-preflight.mjs');
  const page=await open('react-select-multi.html');
  const checkpoint=await captureQuestions(page,'Application');
  assert.deepEqual(checkpoint.questions.map(q=>q.label),['Skills *'],'the aria-hidden shim is not captured');
  await page.setContent('<div class="grecaptcha-badge"><iframe title="reCAPTCHA" src="about:blank#recaptcha/enterprise/anchor?size=invisible" width=256 height=60></iframe></div><p>Apply now</p>');
  assert.equal(await authPreflightScreen(page,{guest:true}),'guest_only');
  await page.setContent('<iframe title="reCAPTCHA" src="about:blank#recaptcha/api2/anchor?size=normal" width=304 height=78></iframe>');
  assert.equal(await authPreflightScreen(page,{guest:true}),'captcha','a visible checkbox challenge still pauses');
  await page.close();
});
