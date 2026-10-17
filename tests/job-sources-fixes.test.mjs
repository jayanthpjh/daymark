import test from 'node:test';import assert from 'node:assert/strict';
import {locationMatches,splitRoles} from '../job-sources/match.mjs';
import {countriesIn} from '../job-sources/geo.mjs';
import {Registry,MemoryStore} from '../job-sources/registry.mjs';
import {createHttp} from '../job-sources/http.mjs';
import * as greenhouse from '../job-sources/ats/greenhouse.mjs';

const posting=(locations,remoteType='unknown')=>({locations,remoteType});
const US=splitRoles('United States');

test('places are read from location text: countries, regions, US states and codes',()=>{
  assert.deepEqual([...countriesIn('Austin, TX')],['us']);
  assert.deepEqual([...countriesIn('Chantilly, Virginia, United States')],['us']);
  assert.deepEqual([...countriesIn('Seattle, Washington')],['us']);
  assert.deepEqual([...countriesIn('Washington, D.C.')],['us']);
  assert.deepEqual([...countriesIn('Remote, Brazil')],['br']);
  assert.deepEqual([...countriesIn('London, UK')],['uk']);
  assert.deepEqual([...countriesIn('Tbilisi, Georgia')],[],'a bare Georgia is not the US state');
  assert.deepEqual([...countriesIn('Atlanta, GA')],['us']);
  assert.deepEqual([...countriesIn('Remote')],[]);
  assert.deepEqual([...countriesIn('Join us in Berlin, Germany')].sort(),['de','us'].sort(),'a whole-word "us" counts, which is why it is only read from location fields');
  assert.deepEqual([...countriesIn('Bonus pay, Italian food')],[],'letters inside other words are never places');
});
test('remote in another country does not match a United States search',()=>{
  for(const locs of [['Remote, Brazil','Campinas, São Paulo, Brazil'],['Remote/Home Based, UK','Remote/Home Based'],['Remote - EMEA'],['Remote Europe'],['Remote, Canada'],['Remote (India)'],['Remote - APAC']])
    assert.equal(locationMatches(posting(locs,'remote'),US),false,locs.join(' | '));
});
test('remote that is open, or in the United States, still matches',()=>{
  for(const locs of [['Remote'],['Remote, United States'],['Remote - US'],['Remote','Austin, Texas, United States'],['Remote - North America'],['Remote - Worldwide'],['Remote','London, United Kingdom','Denver, CO']])
    assert.equal(locationMatches(posting(locs,'remote'),US),true,locs.join(' | '));
});
test('on-site roles match by country, state code, or the named place',()=>{
  assert.equal(locationMatches(posting(['Chantilly, VA']),US),true,'a state code is enough for a United States search');
  assert.equal(locationMatches(posting(['Washington, DC']),US),true);
  assert.equal(locationMatches(posting(['Berlin, Germany']),US),false);
  assert.equal(locationMatches(posting(['Campinas, São Paulo, Brazil']),US),false);
  assert.equal(locationMatches(posting(['Austin, TX']),splitRoles('Austin')),true);
  assert.equal(locationMatches(posting(['Dallas, TX']),splitRoles('Austin')),false);
  assert.equal(locationMatches(posting(['Dallas, TX']),splitRoles('Texas')),true);
  assert.equal(locationMatches(posting(['Dallas, TX']),splitRoles('TX')),true);
  assert.equal(locationMatches(posting(['Paris, France']),splitRoles('France, Germany')),true);
});
test('edge cases: no search, no location, a Remote search, and place-only searches keep remote roles',()=>{
  assert.equal(locationMatches(posting(['Berlin, Germany']),[]),true);
  assert.equal(locationMatches(posting([]),US),true,'unknown location is kept for the person to judge');
  assert.equal(locationMatches(posting(['Remote, Brazil'],'remote'),splitRoles('Remote')),true,'someone who asks for Remote wants remote anywhere');
  assert.equal(locationMatches(posting(['Remote, Brazil'],'remote'),splitRoles('Austin')),true,'a city-only search does not say which country, so remote roles stay');
  assert.equal(locationMatches(posting(['Remote, Brazil'],'remote'),splitRoles('United States, Remote')),true,'Remote in the search list lets remote roles through');
  assert.equal(locationMatches(posting(['Berlin, Germany']),splitRoles('Remote')),false);
});
test('short terms match whole words only',()=>{
  assert.equal(locationMatches(posting(['Prague, Czechia']),splitRoles('CA')),false,'"ca" is not inside "Czechia"');
  assert.equal(locationMatches(posting(['San Diego, CA']),splitRoles('CA')),true);
});

test('due() takes boards in turns across ATS types, so a cap never fills with one ATS',async()=>{
  const reg=await new Registry(new MemoryStore(),{now:()=>1_800_000_000_000}).init();
  const boards=[];
  for(let i=0;i<40;i++)boards.push({ats:'greenhouse',token:`g${i}`});
  for(let i=0;i<5;i++)boards.push({ats:'lever',token:`l${i}`});
  for(let i=0;i<3;i++)boards.push({ats:'ashby',token:`a${i}`});
  await reg.add(boards,'test');
  const due=await reg.due({limit:12});
  assert.equal(due.length,12);
  const count=ats=>due.filter(r=>r.ats===ats).length;
  assert.deepEqual([count('greenhouse'),count('lever'),count('ashby')],[5,4,3]);
  assert.deepEqual(due.slice(0,3).map(r=>r.ats).sort(),['ashby','greenhouse','lever'],'every ATS appears in the first round');
  assert.equal((await reg.due({limit:500})).length,48,'a large cap still returns everything due');
  assert.equal(new Set((await reg.due({limit:500})).map(r=>r.key)).size,48,'no board is returned twice');
});
test('due() keeps new boards ahead of known ones within an ATS, and still honors the schedule',async()=>{
  let now=1_800_000_000_000;
  const reg=await new Registry(new MemoryStore(),{now:()=>now}).init();
  await reg.add([{ats:'greenhouse',token:'a'},{ats:'greenhouse',token:'b'}],'test');
  const [first]=await reg.due();await reg.recordPoll(first,{ok:true,jobCount:3,matchCount:1});
  const due=await reg.due();assert.equal(due.length,1,'the one just polled is not due again yet');
  now+=3*3_600_000;assert.equal((await reg.due()).length,2);
});

const json=body=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
const fakeHttp=routes=>{const calls=[];const fetch=async url=>{calls.push(String(url));for(const [needle,make] of routes)if(String(url).includes(needle))return make();return new Response('',{status:404});};return {http:createHttp({fetch,delayMs:0,sleep:async()=>{},retries:0}),calls};};
const jobsBody=()=>json({jobs:[{id:1,title:'Data Engineer',location:{name:'Remote'},absolute_url:'https://boards.greenhouse.io/acme/jobs/1',content:'x'}]});

test('Greenhouse company names come from the board endpoint when the jobs endpoint has none',async()=>{
  const {http,calls}=fakeHttp([['/boards/acme/jobs',jobsBody],['/boards/acme',()=>json({name:'Acme Corporation'})]]);
  const out=await greenhouse.fetchBoard({token:'acme'},{http});
  assert.equal(out[0].company,'Acme Corporation');assert.equal(calls.length,2);
});
test('a Greenhouse board that already has a name costs no extra request',async()=>{
  const {http,calls}=fakeHttp([['/boards/acme/jobs',jobsBody]]);
  const out=await greenhouse.fetchBoard({token:'acme',company:'Acme Corporation'},{http});
  assert.equal(out[0].company,'Acme Corporation');assert.equal(calls.length,1);
});
test('if the name lookup fails the token stays as the fallback and the jobs still come through',async()=>{
  const {http}=fakeHttp([['/boards/acme/jobs',jobsBody]]);
  const out=await greenhouse.fetchBoard({token:'acme'},{http});
  assert.equal(out.length,1);assert.equal(out[0].company,'acme');
});
test('an empty Greenhouse board does not trigger a name lookup',async()=>{
  const {http,calls}=fakeHttp([['/boards/acme/jobs',()=>json({jobs:[]})]]);
  assert.deepEqual(await greenhouse.fetchBoard({token:'acme'},{http}),[]);assert.equal(calls.length,1);
});

import {countryName} from '../job-sources/geo.mjs';
import * as smartrecruiters from '../job-sources/ats/smartrecruiters.mjs';
test('country codes expand to names, and DE is Germany unless Delaware is named',()=>{
  assert.equal(countryName('de'),'Germany');assert.equal(countryName('US'),'United States');assert.equal(countryName('gb'),'United Kingdom');assert.equal(countryName('fr'),'France');assert.equal(countryName('zz'),'ZZ');assert.equal(countryName(undefined),'');
  assert.deepEqual([...countriesIn('Hamburg, DE')],['de']);assert.deepEqual([...countriesIn('Wilmington, Delaware, DE')],['us']);
  assert.equal(locationMatches(posting(['Berlin, DE']),US),false);assert.equal(locationMatches(posting(['Berlin, DE'],'remote'),US),false);
});
test('SmartRecruiters locations name the country in full, so a French or German role does not pass a US search',async()=>{
  const {http}=fakeHttp([['api.smartrecruiters.com',()=>json({totalFound:2,content:[
    {id:'1',name:'Data Engineer',location:{city:'Issy-les-Moulineaux',region:'IDF',country:'fr',remote:true},company:{identifier:'accor'}},
    {id:'2',name:'Data Engineer',location:{city:'Arlington',region:'VA',country:'us'},company:{identifier:'accor'}}]})]]);
  const out=await smartrecruiters.fetchBoard({token:'accor'},{http,searchTerms:['data engineer'],wantDetail:()=>false});
  const locs=out.map(p=>p.locations[0]);
  assert.deepEqual(locs,['Issy-les-Moulineaux, IDF, France','Arlington, VA, United States']);
  assert.equal(locationMatches(posting([locs[0]],'remote'),US),false);assert.equal(locationMatches(posting([locs[1]]),US),true);
});

test('a bare foreign city names its country, so a remote flag alone does not carry it into a US search',()=>{
  assert.deepEqual([...countriesIn('Berlin')],['de']);assert.deepEqual([...countriesIn('Tel Aviv, Israel')],['il']);assert.deepEqual([...countriesIn('Bangalore')],['in']);
  assert.equal(locationMatches(posting(['Berlin'],'remote'),US),false);
  assert.equal(locationMatches(posting(['Toronto'],'remote'),US),false);
  assert.equal(locationMatches(posting(['Berlin','Austin, TX'],'remote'),US),true,'a role open in a US city as well still fits');
  assert.equal(locationMatches(posting(['remote'],'remote'),US),true);
  assert.deepEqual([...countriesIn('Cambridge, MA')].sort(),['uk','us'].sort(),'a city also used in the US names both; the US one wins for a US search');
  assert.equal(locationMatches(posting(['Cambridge, MA']),US),true);
});

test('a host that answers 429 is slowed for the rest of the run, and known strict hosts start slower',async()=>{
  let t=0;
  const mk=fetch=>createHttp({fetch,delayMs:400,retries:2,now:()=>t,sleep:async ms=>{t+=ms;}});
  let first=true;const seen=[];
  const throttled=mk(async()=>{seen.push(t);if(first){first=false;return new Response('',{status:429});}return new Response('{}',{status:200});});
  await throttled.json('https://slow.example/a');
  seen.length=0;await throttled.json('https://slow.example/b');await throttled.json('https://slow.example/c');
  assert.ok(seen[1]-seen[0]>=800,`after a 429 the host is paced at 800 ms or more, not 400 (got ${seen[1]-seen[0]})`);
  const fresh=mk(async()=>{seen.push(t);return new Response('{}',{status:200});});seen.length=0;
  await fresh.json('https://slow.example/a');await fresh.json('https://slow.example/b');
  assert.ok(seen[1]-seen[0]<800,'a host that never throttled keeps the normal pace');
  const at={};const calm=mk(async url=>{(at[new URL(url).host]||=[]).push(t);return new Response('{}',{status:200});});
  await calm.json('https://apply.workable.com/a');await calm.json('https://apply.workable.com/b');await calm.json('https://boards-api.greenhouse.io/a');await calm.json('https://boards-api.greenhouse.io/b');
  const gap=host=>at[host][1]-at[host][0];
  assert.ok(gap('apply.workable.com')>=1000,'Workable is paced at one request a second');
  assert.ok(gap('boards-api.greenhouse.io')>=400&&gap('boards-api.greenhouse.io')<1000,'other hosts keep the normal pace');
});

test('a host that keeps answering 429 is left alone for the rest of the run',async()=>{
  let calls=0;let blocked=true;
  const http=createHttp({fetch:async()=>{calls++;return blocked?new Response('',{status:429}):new Response('{}',{status:200});},delayMs:0,retries:2,sleep:async()=>{}});
  await assert.rejects(http.json('https://strict.example/a'),/429/);
  await assert.rejects(http.json('https://strict.example/b'),/429/);
  const used=calls;
  await assert.rejects(http.json('https://strict.example/c'),/throttling requests; skipped/);
  assert.equal(calls,used,'no request is made once the host is marked');
  assert.equal(await (async()=>{blocked=false;return (await http.json('https://other.example/a'));})().then(()=>'ok'),'ok','other hosts are unaffected');
  assert.ok(calls>used);
});
test('one success after a throttle resets the count',async()=>{
  const answers=[429,429,429,200];let i=0;
  const http=createHttp({fetch:async()=>{const status=answers[Math.min(i++,answers.length-1)];return new Response('{}',{status});},delayMs:0,retries:4,sleep:async()=>{}});
  assert.deepEqual(await http.json('https://strict.example/a'),{});
  for(let n=0;n<5;n++)await http.json('https://strict.example/b');
});

import {withDeadline,pollBoard} from '../job-sources/collect.mjs';
test('a board that never answers is abandoned after its deadline and recorded as a failed poll',async()=>{
  await assert.rejects(withDeadline(new Promise(()=>{}),30,'slow'),/slow took longer/);
  assert.equal(await withDeadline(Promise.resolve(7),1000),7);
  const registry=await new Registry(new (await import('../job-sources/registry.mjs')).MemoryStore()).init();await registry.add([{ats:'greenhouse',token:'stuck'}],'t');
  const [record]=await registry.due();
  const hang=createHttp({fetch:()=>new Promise(()=>{}),delayMs:0,retries:0,sleep:async()=>{}});
  const out=await pollBoard(registry,record,{http:hang,roles:['x'],canFill:()=>true,boardDeadlineMs:50});
  assert.deepEqual(out.postings,[]);assert.equal(out.openIds,undefined,'a timed-out poll never closes jobs');
  assert.equal((await registry.get(record.key)).failures,1);
});

import {pagePlan,discoverPattern} from '../job-sources/discovery/commoncrawl.mjs';
test('discovery reads pages spread across the whole index, not just the alphabetical start',()=>{
  assert.deepEqual(pagePlan(3,5),[0,1,2],'a small index is read whole');
  const plan=pagePlan(100,5);assert.equal(plan.length,5);assert.equal(plan[0],0);assert.ok(plan.at(-1)>=70,'the last page read is near the end');
  assert.deepEqual([...plan].sort((a,b)=>a-b),plan);assert.equal(new Set(plan).size,5);
  assert.notDeepEqual(pagePlan(100,5,7),plan,'another run reads different pages');
  for(const off of [0,1,2,9,365])for(const p of pagePlan(100,5,off))assert.ok(p>=0&&p<100);
  const blind=pagePlan(null,5);assert.equal(blind[0],0);assert.ok(blind.at(-1)>=40,'without a page count it still reaches far into the index');
});
test('pages past the end are skipped and the rest are still read',async()=>{
  const seen=[];
  const http=createHttp({delayMs:0,retries:0,sleep:async()=>{},fetch:async url=>{
    const q=new URL(url).searchParams;if(q.get('showNumPages'))return new Response('x',{status:502});
    const page=Number(q.get('page'));seen.push(page);
    if(page>40)return new Response('',{status:400});
    return new Response(`{"url":"https://boards.greenhouse.io/company${page}/jobs/1"}\n`,{status:200});}});
  const boards=await discoverPattern(http,'https://index.example/idx','boards.greenhouse.io/*',{maxPages:5});
  assert.ok(seen.length>=5);assert.ok(boards.length>=3,'pages that exist were read even though later probes failed');
  assert.ok(boards.some(b=>Number(b.token.replace('company',''))>=3),'boards beyond the first page were found');
});
