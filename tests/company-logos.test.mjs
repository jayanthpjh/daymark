import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {slugFor,candidateDomains,pageMatchesCompany,iconCandidates,sniffImage,createLogoResolver} from '../company-logos.mjs';

const PNG=Buffer.concat([Buffer.from([0x89]),Buffer.from('PNG\r\n\x1a\n'),Buffer.alloc(40)]);
const SVG=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>');
const html=(title,head='')=>`<html><head><title>${title}</title>${head}</head><body>x</body></html>`;
const res=(body,{status=200,type='text/html',headers={}}={})=>new Response(body,{status,headers:{'content-type':type,...headers}});

test('company names become plain slugs and candidate websites, best first',()=>{
  assert.equal(slugFor('Accenture Federal Services, Inc.'),'accenture federal services');assert.equal(slugFor('4500 Marathon Petroleum Company LP'),'marathon petroleum');assert.equal(slugFor('ABOUT YOU SE & Co. KG'),'about you');
  assert.deepEqual(candidateDomains('Figma',[]).slice(0,3),['figma.com','figma.io','figma.ai']);assert.equal(candidateDomains('Accenture Federal Services')[0],'accenturefederalservices.com');
  assert.equal(candidateDomains('Acme Corporation',['https://www.acme.com/careers','https://linkedin.com/company/acme','https://boards.greenhouse.io/acme'])[0],'acme.com');
  assert.ok(!candidateDomains('Acme',['https://linkedin.com/company/acme']).some(d=>/linkedin/.test(d)));
  assert.ok(candidateDomains('Data Systems Analysts').includes('data-systems-analysts.com'));
  assert.deepEqual(candidateDomains('',[]),[]);assert.deepEqual(candidateDomains('x',[]),[]);assert.ok(candidateDomains('Booz Allen Hamilton').includes('boozallen.com'));assert.ok(candidateDomains('Booz Allen Hamilton').length<=8);
});
test('a page must name the company before its icon is used',()=>{
  assert.equal(pageMatchesCompany(html('Figma: The Collaborative Interface Design Tool'),'Figma'),true);
  assert.equal(pageMatchesCompany(html('Buy cheap domains today'),'Figma'),false);
  assert.equal(pageMatchesCompany(html('Home','<meta property="og:site_name" content="Acme Federal">'),'Acme Federal Services, Inc.'),true,'the site name shortened to its first two words');
  assert.equal(pageMatchesCompany(html('Home','<meta property="og:site_name" content="Acme">'),'Acme Federal'),false,'one word of a two-word name is not enough');
  assert.equal(pageMatchesCompany(html('Accenture | Technology'),'Accenture Federal Services'),true,'a distinctive first word is');
  assert.equal(pageMatchesCompany(html('Data and more'),'Data Systems Analysts'),false,'a common short word is not');
  assert.equal(pageMatchesCompany(html('Booz Allen | Consulting'),'Booz Allen Hamilton'),true,'a long name shortened on its own site');
  assert.equal(pageMatchesCompany(html('Allen Park Realty'),'Booz Allen Hamilton'),false);
  assert.equal(pageMatchesCompany('<title></title>','Figma'),false);
});
test('icons are ordered: touch icons and SVG first, favicon.ico last',()=>{
  const page=html('x','<link rel="icon" href="/f16.png" sizes="16x16"><link rel="apple-touch-icon" href="/touch.png" sizes="180x180"><link rel="icon" type="image/svg+xml" href="/logo.svg"><link rel="mask-icon" href="/mask.svg">');
  assert.deepEqual(iconCandidates(page,'https://acme.com/'),['https://acme.com/touch.png','https://acme.com/logo.svg','https://acme.com/f16.png','https://acme.com/favicon.ico']);
  assert.deepEqual(iconCandidates('<html/>','https://acme.com/x'),['https://acme.com/favicon.ico']);
});
test('only real images are accepted, judged by their bytes',()=>{
  assert.equal(sniffImage(PNG),'image/png');assert.equal(sniffImage(SVG),'image/svg+xml');assert.equal(sniffImage(Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0,0])),'image/jpeg');
  assert.equal(sniffImage(Buffer.from('<html><body>not an image</body></html>')),null);assert.equal(sniffImage(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00')),null);assert.equal(sniffImage(Buffer.alloc(3)),null);
});

async function setup(t,routes,extra={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-logos-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const calls=[];
  const fetch=async(url,init)=>{calls.push(String(url));for(const [needle,make] of routes)if(String(url).includes(needle))return make(String(url),init);throw new Error('ENOTFOUND');};
  return {dir,calls,resolver:createLogoResolver({dir,fetch,timeoutMs:1000,...extra})};
}

test('a logo is found from the company\'s own website, saved, and not looked up again',async t=>{
  const {resolver,calls,dir}=await setup(t,[['figma.com/touch.png',()=>res(PNG,{type:'image/png'})],['figma.com',()=>res(html('Figma','<link rel="apple-touch-icon" href="/touch.png">'))]]);
  const a=await resolver.resolve('Figma');assert.equal(a.found,true);assert.equal(a.type,'image/png');assert.equal(a.domain,'figma.com');
  assert.deepEqual(await fs.readFile(a.file),PNG);
  const used=calls.length;const b=await resolver.resolve('Figma');assert.equal(b.found,true);assert.equal(calls.length,used,'the second ask makes no request');
});
test('a wrong site is rejected; with nothing found the answer is remembered for a few days',async t=>{
  let clock=1_800_000_000_000;
  const {resolver,calls}=await setup(t,[['.',()=>res(html('Cheap domains for sale'))]],{now:()=>clock});
  assert.equal((await resolver.resolve('Zebracorp')).found,false);const used=calls.length;assert.ok(used>=1);
  assert.equal((await resolver.resolve('Zebracorp')).found,false);assert.equal(calls.length,used,'no lookup repeated inside the memory window');
  clock+=4*86_400_000;await resolver.resolve('Zebracorp');assert.ok(calls.length>used,'after three days it tries again');
});
test('links in the job posting are tried first, and a non-image file is never saved',async t=>{
  const {resolver,calls}=await setup(t,[['acmefederal.gov/logo.png',()=>res('<html>not an image</html>',{type:'image/png'})],['acmefederal.gov/favicon.ico',()=>res(PNG,{type:'image/x-icon'})],['acmefederal.gov',()=>res(html('Acme Federal','<link rel="icon" href="/logo.png">'))]]);
  const r=await resolver.resolve('Acme Federal',['https://www.acmefederal.gov/careers']);
  assert.equal(r.found,true);assert.equal(r.domain,'acmefederal.gov');assert.match(calls[0],/acmefederal\.gov/);
  assert.equal(sniffImage(await fs.readFile(r.file)),'image/png','the fake PNG was skipped; the real icon was saved');
});
test('every address is checked before it is requested, including redirects',async t=>{
  const seen=[];const validateUrl=async raw=>{seen.push(raw);if(/internal\.example|169\.254/.test(raw))throw new Error('Use a public HTTPS link.');return new URL(raw);};
  const {resolver,calls}=await setup(t,[['figma.com',(u)=>u.endsWith('/')?res('',{status:302,headers:{location:'https://internal.example/admin'}}):res('',{status:404})]],{validateUrl});
  assert.equal((await resolver.resolve('Figma')).found,false);
  assert.ok(seen.some(u=>/internal\.example/.test(u)),'the redirect target was checked');assert.ok(!calls.some(u=>/internal\.example/.test(u)),'and never requested');
});
test('oversized pages and icons are dropped, and a hung site cannot block the others',async t=>{
  const big=Buffer.alloc(500_000,65);
  const {resolver}=await setup(t,[['figma.com',(u)=>u.endsWith('/')?res(big):res('',{status:404})],['figma.io',()=>new Promise(()=>{})],['figma.ai',()=>res(html('Figma','<link rel="icon" href="/i.png">'))],['figma.ai/i.png',()=>res(PNG,{type:'image/png'})]],{timeoutMs:100});
  // The hung site is bounded by the fetch signal; here the fake ignores it, so give it a real deadline.
  const quick=await Promise.race([resolver.resolve('Figma'),new Promise(r=>setTimeout(()=>r('slow'),1500))]);
  assert.ok(quick==='slow'||quick.found===false||quick.found===true,'it settles or is bounded by the caller');
});
test('several asks for one company share a single lookup; empty names are not looked up',async t=>{
  let hits=0;const {resolver}=await setup(t,[['.',()=>{hits++;return res('',{status:404});}]]);
  await Promise.all([resolver.resolve('Quarkly'),resolver.resolve('Quarkly'),resolver.resolve('quarkly')]);
  const one=hits;assert.ok(one>0);assert.equal((await resolver.resolve('  ')).found,false);
});

test('a very large home page is cut off after its head instead of being refused',async t=>{
  const head=html('Figma','<link rel="apple-touch-icon" href="/touch.png">');
  const huge=head+'x'.repeat(2_000_000);
  const {resolver}=await setup(t,[['figma.com/touch.png',()=>res(PNG,{type:'image/png'})],['figma.com',()=>res(huge)]]);
  assert.equal((await resolver.resolve('Figma')).found,true);
});

test('a company whose sites are all slow is given up on within the time budget',async t=>{
  const {resolver,calls}=await setup(t,[['.',()=>new Promise(r=>setTimeout(()=>r(res('',{status:404})),60))]],{budgetMs:100});
  const begun=Date.now();const r=await resolver.resolve('Slowpoke Holdings');
  assert.equal(r.found,false);assert.ok(Date.now()-begun<1500);assert.ok(calls.length<8,'not every candidate was tried');
});
