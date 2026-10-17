import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {escapeLatex,renderJake,createLatexPdf,TECTONIC_ARGS} from '../latex-resume.mjs';
import {createPdf} from '../resume-export.mjs';

const body='Alex Doe\nalex@example.test | Dayton, Ohio\n\nEDUCATION\nExample University | BS Computer Science\nAug 2016 – May 2020\n\nEXPERIENCE\nExample Company | Data Engineer\nJan 2022 – May 2025\n- Reduced runtime by 20% with Kafka & Spark.\n- Wrote \\input{/etc/passwd} docs.\n\nPROJECTS\nPipeline Kit | Python\n2023 – Present\n- Built a_tool.\n\nSKILLS\nLanguages: Python, SQL\n\nCERTIFICATIONS\n';
const tmp=()=>fs.mkdtemp(path.join(os.tmpdir(),'daymark-latex-'));

test('escapeLatex neutralises every special character, including \\input',()=>{
  assert.equal(escapeLatex('\\ { } $ & # ^ _ % ~'),'\\textbackslash{} \\{ \\} \\$ \\& \\# \\textasciicircum{} \\_ \\% \\textasciitilde{}');
  const out=escapeLatex('\\input{/etc/passwd}');
  assert.equal(out,'\\textbackslash{}input\\{/etc/passwd\\}');
  assert.ok(!/(^|[^\\])\\input/.test(out.replace(/\\textbackslash\{\}/g,'')));
});
test('renderJake escapes resume text and omits empty sections',async()=>{
  const tex=await renderJake(body,'Alex Doe');
  assert.ok(tex.includes('\\textbackslash{}input\\{/etc/passwd\\}'));
  assert.ok(!tex.includes('\\input{'));
  for(const s of ['Education','Experience','Projects','Technical Skills'])assert.ok(tex.includes(`\\section{${s}}`),s);
  assert.ok(!/Certifications|Summary/.test(tex));
  assert.ok(tex.indexOf('Education')<tex.indexOf('Experience')&&tex.indexOf('Experience')<tex.indexOf('Projects'));
  assert.ok(tex.includes('Jan 2022 – May 2025'));
});
test('LaTeX path writes the runner output with untrusted, cached-only args',async()=>{
  const dir=await tmp();let seen;
  try{
    const out=path.join(dir,'o.pdf');
    const ok=await createLatexPdf(body,'Alex Doe',out,{runner:async(cmd,args,{cwd})=>{seen={cmd,args};await fs.writeFile(path.join(cwd,'resume.pdf'),'%PDF-fake');return {code:0};}});
    assert.equal(ok,true);assert.equal(await fs.readFile(out,'utf8'),'%PDF-fake');
    assert.deepEqual(seen.args,TECTONIC_ARGS);assert.ok(seen.args.includes('--untrusted')&&seen.args.includes('--only-cached'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('a runaway build is killed at the timeout and falls back',async()=>{
  const dir=await tmp();let killed=false;
  try{
    const runner=(c,a,{timeoutMs})=>new Promise(res=>setTimeout(()=>{killed=true;res({code:null,timedOut:true});},timeoutMs));
    const t=Date.now();
    assert.equal(await createLatexPdf(body,'Alex Doe',path.join(dir,'o.pdf'),{runner,timeoutMs:50}),false);
    assert.ok(killed&&Date.now()-t<2000);
    const out=path.join(dir,'f.pdf');
    await createPdf('Resume',body,out,'Alex Doe',{template:'jake'},{runner});
    assert.ok((await fs.readFile(out)).subarray(0,4).toString()==='%PDF');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('default 30 second timeout is used and a missing binary falls back to a parseable pdfkit PDF',async()=>{
  const dir=await tmp();let timeout;
  try{
    await createLatexPdf(body,'Alex Doe',path.join(dir,'x.pdf'),{runner:async(c,a,o)=>{timeout=o.timeoutMs;return {code:1};}});
    assert.equal(timeout,30_000);
    const out=path.join(dir,'jake.pdf');
    await createPdf('Resume',body,out,'Alex Doe',{template:'jake'},{binary:'daymark-no-such-tectonic'});
    const pdf=await getDocument({data:new Uint8Array(await fs.readFile(out)),useSystemFonts:true}).promise;
    let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')+' ';
    const order=['Alex Doe','EDUCATION','Aug 2016','EXPERIENCE','Jan 2022','Kafka','PROJECTS','2023','SKILLS','Python, SQL'];
    let at=-1;for(const k of order){const i=text.indexOf(k,at+1);assert.ok(i>at,k);at=i;}
    await pdf.cleanup();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
