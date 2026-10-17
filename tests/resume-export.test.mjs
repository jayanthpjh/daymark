import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mammoth from 'mammoth';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createDocx,createPdf,documentFilename,resumeUploadPath} from '../resume-export.mjs';

test('document filenames are descriptive, bounded, and safe for paths and headers',()=>{
  const name=documentFilename({name:'José / ../../\r\n',company:'A "Company"',role:'Engineer'.repeat(30),version:2});
  assert.match(name,/^Jose_A_Company_[A-Za-z0-9_]+\.pdf$/);assert.ok(name.length<120);
  assert.equal(documentFilename({}), 'Candidate_Company_Role.pdf');
  assert.equal(documentFilename({name:'Jayanth Pasupuleti',company:'Market Metrix',role:'Senior Data Engineer'}),'Jayanth_Pasupuleti_Market_Metrix_Senior_Data_Engineer.pdf');
  assert.equal(documentFilename({name:'Jayanth Pasupuleti',company:'Market Metrix',role:'Senior Data Engineer',kind:'cover-letter'}),'Jayanth_Pasupuleti_Market_Metrix_Senior_Data_Engineer_Cover_Letter.pdf');
  assert.throws(()=>documentFilename({ext:'html'}));assert.throws(()=>documentFilename({version:-1}));
});
test('single-column PDF and DOCX preserve identity, sections and supplied facts as text',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-export-'));
  const body='Alex Doe\nalex@example.test | Dayton, Ohio\n\nSUMMARY\nData engineer focused on reliable delivery.\n\nEXPERIENCE\nExample Company | Data Engineer | 2022–2025\n- Reduced runtime by 20%.\n\nEDUCATION\nExample University | BS Computer Science';
  try {
    const pdf=path.join(dir,'resume.pdf'),docx=path.join(dir,'resume.docx');
    await Promise.all([createPdf('Resume',body,pdf,'Alex Doe'),createDocx('Resume',body,docx,'Alex Doe')]);
    const document=await getDocument({data:new Uint8Array(await fs.readFile(pdf)),useSystemFonts:true}).promise;
    let text='';for(let i=1;i<=document.numPages;i++)text+=(await(await document.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');
    const word=(await mammoth.extractRawText({path:docx})).value;
    for(const fact of ['Alex Doe','alex@example.test','SUMMARY','EXPERIENCE','2022–2025','20%','EDUCATION']){assert.ok(text.includes(fact),fact);assert.ok(word.includes(fact),fact);}
    assert.equal(await resumeUploadPath({resumePdf:pdf,resumeDocx:docx},{getAttribute:async()=>'.docx'},'workday'),docx);
    await assert.rejects(resumeUploadPath({resumePdf:pdf},{getAttribute:async()=>'.txt'},'workday'),/does not accept/);
    await document.cleanup();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Standard and Jake exports retain every supplied fact with distinct font families',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-formats-'));
 const body='Alex Doe\nalex@example.test | Dayton, Ohio\n\nSUMMARY\nVerified engineering experience.\n\nEXPERIENCE\nExample Company | Engineer\nJan 2022 – May 2025\n- Reduced runtime by 20%.';
 try{const fonts=[];for(const template of ['standard','jake']){const file=path.join(dir,template+'.pdf');await createPdf('Resume',body,file,'Alex Doe',{template});const pdf=await getDocument({data:new Uint8Array(await fs.readFile(file)),useSystemFonts:true}).promise;const page=await pdf.getPage(1),content=await page.getTextContent();const text=content.items.map(x=>x.str).join(' ');for(const fact of ['Alex Doe','alex@example.test','Example Company','2022','2025','20%'])assert.ok(text.includes(fact),template+': '+fact);fonts.push(Object.values(content.styles).map(x=>x.fontFamily).join(','));assert.equal(pdf.numPages,1);await pdf.cleanup();}assert.notEqual(fonts[0],fonts[1]);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
