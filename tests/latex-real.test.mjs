import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createLatexPdf,TECTONIC_ARGS} from '../latex-resume.mjs';

const hasTectonic=!spawnSync('tectonic',['--version'],{stdio:'ignore'}).error;
const body='Alex Doe\napply@example.test | 555-0100\n\nSUMMARY\nData engineer.\n\nSKILLS\nPython, SQL\n\nEXPERIENCE\nSenior Data Engineer, Northwind Analytics\nMar 2021 - Present\n- Line with \\input{/etc/passwd} and 50% off_{x} stays literal.\n\nEDUCATION\nB.S. Computer Science, University of Texas at Austin, 2018';

test('the Tectonic arguments are flags it accepts: offline, untrusted, no value-taking flags that Tectonic rejects',()=>{
  assert.ok(TECTONIC_ARGS.includes('--only-cached'));assert.ok(TECTONIC_ARGS.includes('--untrusted'));
  assert.deepEqual(TECTONIC_ARGS.filter(arg=>arg.startsWith('--')&&arg.includes('=')),[],'Tectonic 0.17 rejects --flag=value forms such as --keep-logs=false');
});
(hasTectonic?test:test.skip)('a real Tectonic render works offline from the cache and returns a one-page PDF',async()=>{
  const out=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'daymark-latex-real-')),'resume.pdf');
  const ok=await createLatexPdf(body,'Alex Doe',out);
  assert.equal(ok,true,'render failed: run `node scripts/prefetch-tectonic.mjs` once to fill the package cache');
  const pdf=await fs.readFile(out);assert.equal(pdf.subarray(0,4).toString(),'%PDF');
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc=await getDocument({data:new Uint8Array(pdf),useSystemFonts:true}).promise;
  assert.equal(doc.numPages,1);
  const page=await doc.getPage(1);const text=(await page.getTextContent()).items.map(item=>item.str).join(' ');
  assert.ok(/Education/.test(text)&&/Experience/.test(text)&&/Mar 2021/.test(text));
  assert.ok(/etc\/passwd/.test(text),'the \\input line is printed, not executed');
  assert.ok(!/root:.*:0:0:/.test(text),'no file contents were pulled in');
  await fs.rm(path.dirname(out),{recursive:true,force:true});
});

test('a resume that spills past one page is rebuilt at a smaller size, then kept at the smallest',async()=>{
  const sizes=[];
  const runner=async(cmd,args,{cwd})=>{const tex=await fs.readFile(path.join(cwd,'resume.tex'),'utf8');sizes.push(/\\documentclass\[letterpaper,(\d+)pt\]/.exec(tex)[1]);await fs.writeFile(path.join(cwd,'resume.pdf'),'%PDF-1.5 fake');return {code:0,timedOut:false};};
  const out=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'daymark-shrink-')),'r.pdf');
  assert.equal(await createLatexPdf(body,'Alex Doe',out,{fontSize:12,runner,pageCounter:async()=>2}),true);
  assert.deepEqual(sizes,['12','11','10'],'tries each smaller size, stops at 10');
  sizes.length=0;
  assert.equal(await createLatexPdf(body,'Alex Doe',out,{fontSize:12,runner,pageCounter:async()=>1}),true);
  assert.deepEqual(sizes,['12'],'one page: no rebuild');
  await fs.rm(path.dirname(out),{recursive:true,force:true});
});
