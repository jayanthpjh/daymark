import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfTextLines,parseResume,questionCatalog,compensationForJob,migrateAnswerPack,missingProtectedResumeFacts,resumeTemplateHtml} from '../public/workflow.js';
test('PDF lines survive extraction so sections parse',()=>{
 const items=['Jane Doe','Senior Engineer','SKILLS','JavaScript','EXPERIENCE','Engineer | Acme','Built systems','EDUCATION','BS Computer Science'].map((str,i)=>({str,transform:[1,0,0,1,0,700-i*20]}));
 const result=parseResume(pdfTextLines(items));assert.equal(result.fields.name,'Jane Doe');assert.equal(result.fields.skills,'JavaScript');assert.match(result.fields.workHistory,/Acme/);assert.equal(result.fields.education,'BS Computer Science');assert(!('email' in result.fields));
});
test('relocation and travel have exactly Yes and No choices',()=>{for(const id of ['relocation','travel'])assert.deepEqual(questionCatalog.find(q=>q.id===id).options,['Yes','No']);});
test('compensation uses a published range then annual fallback',()=>{assert.equal(compensationForJob({salary:'$120,000–$150,000 USD annually'}).answer,'$120,000–$150,000 USD annually');assert.equal(compensationForJob({salary:''}).answer,'$110,000 USD annually');assert.equal(compensationForJob({salary:'Salary not listed'}).fallback,110000);});
test('legacy migration does not guess sponsorship or descriptive answers',()=>{const p=migrateAnswerPack([{question:'What is your current work authorization?',answer:'Yes'},{question:'Will you need visa sponsorship now or later?',answer:'No'},{question:'What accomplishment would you like to highlight?',answer:'Built software'}]);assert.deepEqual(p.values,{authorization_us:'Yes'});});
test('tailored drafts must retain confirmed identity, role dates, employer line, and labeled client names',()=>{
 const profile={name:'Jane Doe',email:'jane@example.com',phone:'+1 212 555 0100',linkedin:'https://linkedin.com/in/janedoe',workHistory:'Senior Engineer | Acme Inc.\nJan 2022 - Present\n- Served client: Green Fields'};
 const complete='Jane Doe\njane@example.com\n+1 212 555 0100\nhttps://linkedin.com/in/janedoe\nSenior Engineer | Acme Inc.\nJan 2022 - Present\nServed client: Green Fields';
 assert.deepEqual(missingProtectedResumeFacts(complete,profile),[]);
 assert(missingProtectedResumeFacts(complete.replace('Acme Inc.','Other Co.'),profile).includes('Senior Engineer | Acme Inc.'));
 assert(missingProtectedResumeFacts(complete.replace('Green Fields','Other Client'),profile).includes('Green Fields'));
 assert(missingProtectedResumeFacts(complete.replace('jane@example.com','other@example.com'),profile).includes('jane@example.com'));
});
test('shared resume renderer makes headings and bullets readable and escapes markup',()=>{
 const html=resumeTemplateHtml('Jane Doe\nSUMMARY\nEngineer\nSKILLS\n- TypeScript\nEXPERIENCE\n- <script>alert(1)</script>');
 assert.match(html,/<h1>Jane Doe<\/h1>/);assert.match(html,/<h2>SKILLS<\/h2>/);assert.match(html,/<ul><li>TypeScript<\/li><\/ul>/);assert(!html.includes('<script>'));
});

test('published hiring range in a description overrides fallback without mistaking unrelated amounts',()=>{
 assert.equal(compensationForJob({description:'Hiring Salary Range: $110,000.00 - 165,000.00.\nBenefits included.'}).answer,'$110,000–$165,000');
 assert.equal(compensationForJob({description:'The salary for this position is a base between $185,000 - $215,000.'}).answer,'$185,000–$215,000');
 assert.equal(compensationForJob({description:'Budget $110,000 - $165,000 for equipment.'}).source,'Your fallback');
 assert.equal(compensationForJob({salary:'Pay not listed',description:'Base salary range: $120,000–$160,000'}).source,'Company published base pay');
});
