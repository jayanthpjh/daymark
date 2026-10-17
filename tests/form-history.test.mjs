import test,{after} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {parseDateRange,parseEducationLine,historyEntries,formatDateFor,canonicalDate,historyAnswers} from '../form-history.mjs';
import {captureQuestions,applyQuestionAnswers,resumeFileInput,sameAnswer} from '../application-questions.mjs';
import {resolveAnswers} from '../answer-engine.mjs';
import {authPreflightScreen} from '../ats-auth-preflight.mjs';
import {launchTestBrowser} from './helpers/browser.mjs';
const browser=await launchTestBrowser();const live=browser?test:test.skip;
after(async()=>{await browser?.close();});
const fixture=name=>fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures/ats',name),'utf8');
const open=async name=>{const page=await browser.newPage();await page.setContent(fixture(name));return page;};

const resume='Alex Doe\napply@example.test | 555-0100\n\nSUMMARY\nData engineer.\n\nEXPERIENCE\nSenior Data Engineer, Northwind Analytics\nMar 2021 - Present\n- Rebuilt 120 dbt models.\n- Ran Airflow pipelines.\nData Analyst | Contoso Ltd | Jun 2018 - Feb 2021\n- Built dashboards.\n\nEDUCATION\nB.S. Computer Science, University of Texas at Austin, 2018';

test('date ranges read months, years and "Present"',()=>{
  assert.deepEqual(parseDateRange('Mar 2021 - Present'),{start:{y:2021,m:3},end:null,current:true});
  assert.deepEqual(parseDateRange('03/2019 – 06/2020'),{start:{y:2019,m:3},end:{y:2020,m:6},current:false});
  assert.deepEqual(parseDateRange('2018'),{start:{y:2018,m:0},end:{y:2018,m:0},current:false});
  assert.equal(parseDateRange('no dates here'),null);
});
test('education lines split into degree, field, school and year',()=>{
  const e=parseEducationLine('B.S. Computer Science, University of Texas at Austin, 2018');
  assert.equal(e.degree,'B.S.');assert.equal(e.field,'Computer Science');assert.equal(e.school,'University of Texas at Austin');assert.equal(e.end.y,2018);assert.equal(e.start,null,'one year is the graduation year, not a start date');
});
test('the resume yields work and education entries, in order, with nothing invented',()=>{
  const h=historyEntries(resume);
  assert.equal(h.experience.length,2);
  assert.deepEqual([h.experience[0].title,h.experience[0].company,h.experience[0].current],['Senior Data Engineer','Northwind Analytics',true]);
  assert.deepEqual([h.experience[1].title,h.experience[1].company,h.experience[1].end.m],['Data Analyst','Contoso Ltd',2]);
  assert.match(h.experience[0].description,/dbt models\.\nRan Airflow/);
  assert.equal(h.education.length,1);
  assert.deepEqual(historyEntries(''),{experience:[],education:[]});
});
test('dates are formatted the way each field shows them, and read back the same',()=>{
  const s={y:2021,m:3};
  assert.equal(formatDateFor({type:'date'},s),'2021-03-01');assert.equal(formatDateFor({type:'month'},s),'2021-03');
  assert.equal(formatDateFor({type:'text',placeholder:'MM/YYYY'},s),'03/2021');assert.equal(formatDateFor({type:'text',placeholder:'MM/DD/YYYY'},s),'03/01/2021');
  assert.equal(formatDateFor({type:'text',label:'Graduation year'},s),'2021');assert.equal(formatDateFor({type:'text'},null),'');
  for(const shown of ['2021-03-01','03/2021','03/01/2021','Mar 2021'])assert.equal(canonicalDate(shown),'2021-03',shown);
  assert.equal(sameAnswer({type:'text',label:'Start Date'},'03/2021','2021-03-01'),true,'a masked date matches the typed one');
  assert.equal(sameAnswer({type:'text',label:'Start Date'},'04/2021','2021-03-01'),false);
});
test('blocks map in order: nth job on the page gets the nth resume entry; a current job leaves End Date blank',()=>{
  const q=(id,label,extra={})=>({id,label,type:'text',value:'',...extra});
  const qs=[q('t1','Job Title'),q('c1','Company'),q('s1','Start Date',{type:'month'}),q('e1','End Date',{type:'month'}),q('t2','Job Title'),q('c2','Company'),q('s2','Start Date',{placeholder:'MM/YYYY'}),q('e2','End Date',{placeholder:'MM/YYYY'}),q('sc','School'),q('ge','End Date',{type:'date'})];
  const a=historyAnswers(qs,historyEntries(resume));
  assert.deepEqual([a.t1,a.c1,a.s1,a.e1],['Senior Data Engineer','Northwind Analytics','2021-03',undefined]);
  assert.deepEqual([a.t2,a.c2,a.s2,a.e2],['Data Analyst','Contoso Ltd','06/2018','02/2021']);
  assert.equal(a.sc,'University of Texas at Austin');assert.equal(a.ge,undefined,'a graduation year alone cannot fill a full-date field without inventing a month');
});
test('a third job block with only two resume entries stays blank; filled and manual fields are left alone',()=>{
  const h=historyEntries(resume);
  const qs=[{id:'a',label:'Job Title',type:'text',value:''},{id:'b',label:'Job Title',type:'text',value:''},{id:'c',label:'Job Title',type:'text',value:''},{id:'d',label:'Company',type:'text',value:'Typed by hand'}];
  const a=historyAnswers(qs,h);assert.ok(a.a&&a.b);assert.equal(a.c,undefined);
  assert.equal(historyAnswers([{id:'x',label:'Job Title',type:'text',value:'',manual:true}],h).x,undefined);
  assert.equal(historyAnswers([{id:'y',label:'Company',type:'text',value:'Typed by hand'}],h).y,undefined);
});

live('controls inside an open shadow root are captured with their labels',async()=>{
  const page=await open('shadow-form.html');
  const cp=await captureQuestions(page,'Application');
  const labels=cp.questions.map(q=>q.label);
  assert.ok(labels.includes('First name *')||labels.includes('First name'),`labels: ${labels}`);
  assert.ok(labels.includes('Last name'),'aria-labelledby resolves inside the shadow root');
  assert.ok(labels.includes('Phone'),'light-DOM fields are still found, in order');
  assert.ok(labels.indexOf('Phone')>labels.findIndex(l=>/First name/.test(l)),'document order is kept');
  assert.equal(cp.questions.find(q=>/Last name/.test(q.label)).required,true);
  const result=await applyQuestionAnswers(page,cp,{[cp.questions.find(q=>/First name/.test(q.label)).id]:'Alex'});
  assert.deepEqual(result.errors,{},JSON.stringify(result.errors));
  assert.equal(await page.evaluate(()=>document.getElementById('host').shadowRoot.getElementById('fn').value),'Alex');
  await page.close();
});

live('repeating work and education blocks fill from the resume and verify after typing',async()=>{
  const page=await open('work-history.html');
  const cp=await captureQuestions(page,'My Experience');
  const resolved=resolveAnswers(cp.questions,{history:historyEntries(resume),profile:{},email:'a@example.test'});
  const mine=Object.entries(resolved.sources).filter(([,s])=>s==='resume');
  assert.ok(mine.length>=8,`resume-sourced answers: ${mine.length}`);
  const result=await applyQuestionAnswers(page,cp,Object.fromEntries(Object.entries(resolved.answers).filter(([id])=>resolved.sources[id]==='resume')));
  assert.deepEqual(result.errors,{},JSON.stringify(result.errors));
  const v=await page.evaluate(()=>Object.fromEntries(['t1','c1','s1','e1','t2','c2','s2','e2','sc','dg','fs','ge'].map(id=>[id,document.getElementById(id).value])));
  assert.deepEqual(v,{t1:'Senior Data Engineer',c1:'Northwind Analytics',s1:'2021-03',e1:'',t2:'Data Analyst',c2:'Contoso Ltd',s2:'06/2018',e2:'02/2021',sc:'University of Texas at Austin',dg:v.dg,fs:'Computer Science',ge:''});
  await page.close();
});

live('a visible hCaptcha on a Lever-style form pauses for the applicant',async()=>{
  const page=await open('lever-captcha.html');
  assert.equal(await authPreflightScreen(page,{authenticated:false,guest:true}),'captcha');
  await page.close();
});
live('an Ashby-style drop zone with a hidden file input still takes the resume',async()=>{
  const page=await open('ashby-dropzone.html');
  const input=await resumeFileInput(page);
  assert.equal(await input.count(),1);
  await input.setInputFiles(new URL('../package.json',import.meta.url).pathname);
  assert.equal(await page.locator('#fname').textContent(),'package.json');
  await page.close();
});
