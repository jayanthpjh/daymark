import test from 'node:test';import assert from 'node:assert/strict';
import {checkOpen} from '../job-sources/open-check.mjs';
import {createHttp} from '../job-sources/http.mjs';

const respond=(status,body={},url)=>{const r=new Response(typeof body==='string'?body:JSON.stringify(body),{status});if(url)Object.defineProperty(r,'url',{value:url});return r;};
const world=routes=>{const calls=[];const fetch=async(url,init)=>{calls.push(String(url));for(const [needle,make] of routes)if(String(url).includes(needle))return make(String(url),init);return respond(404,'');};return {http:createHttp({fetch,delayMs:0,sleep:async()=>{},retries:0}),calls};};

test('Greenhouse, Lever, SmartRecruiters, Workable and Workday: 200 means open, 404 or 410 means closed',async()=>{
  const cases=[
    ['https://boards.greenhouse.io/acme/jobs/123','boards-api.greenhouse.io/v1/boards/acme/jobs/123'],
    ['https://jobs.lever.co/acme/abc-def','api.lever.co/v0/postings/acme/abc-def'],
    ['https://jobs.eu.lever.co/acme/abc-def','api.eu.lever.co/v0/postings/acme/abc-def'],
    ['https://jobs.smartrecruiters.com/Acme/743999','api.smartrecruiters.com/v1/companies/Acme/postings/743999'],
    ['https://apply.workable.com/acme/j/ABC123/','apply.workable.com/api/v2/accounts/acme/jobs/ABC123'],
    ['https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin/Data-Engineer_R-1','acme.wd5.myworkdayjobs.com/wday/cxs/acme/Careers/job/Austin/Data-Engineer_R-1'],
  ];
  for(const [url,endpoint] of cases){
    for(const [status,want] of [[200,'open'],[404,'closed'],[410,'closed'],[500,'unknown'],[429,'unknown']]){
      const {http,calls}=world([[endpoint,()=>respond(status)]]);
      const out=await checkOpen({url},{http});
      assert.equal(out.status,want,`${url} -> ${status}`);assert.equal(calls.length,1);assert.ok(calls[0].includes(endpoint),calls[0]);
    }
  }
});
test('Ashby and Recruitee are answered from the board list',async()=>{
  const ashby=world([['api.ashbyhq.com',()=>respond(200,{jobs:[{id:'11111111-aaaa',jobUrl:'https://jobs.ashbyhq.com/acme/11111111-aaaa'}]})]]);
  assert.equal((await checkOpen({url:'https://jobs.ashbyhq.com/acme/11111111-aaaa'},{http:ashby.http})).status,'open');
  assert.equal((await checkOpen({url:'https://jobs.ashbyhq.com/acme/22222222-bbbb'},{http:ashby.http})).status,'closed');
  const rec=world([['acme.recruitee.com/api/offers',()=>respond(200,{offers:[{slug:'data-engineer',careers_url:'https://acme.recruitee.com/o/data-engineer'}]})]]);
  assert.equal((await checkOpen({url:'https://acme.recruitee.com/o/data-engineer'},{http:rec.http})).status,'open');
  assert.equal((await checkOpen({url:'https://acme.recruitee.com/o/sales-lead'},{http:rec.http})).status,'closed');
});
test('any other site: a missing page is closed; a redirect to the front page is closed; anything else is unknown',async()=>{
  const gone=world([['careers.example.com',()=>respond(404,'')]]);
  assert.deepEqual(await checkOpen({url:'https://careers.example.com/jobs/42/data-engineer'},{http:gone.http}),{status:'closed',via:'page'});
  const moved=world([['careers.example.com',()=>respond(200,'<html/>','https://careers.example.com/')]]);
  assert.equal((await checkOpen({url:'https://careers.example.com/jobs/42/data-engineer'},{http:moved.http})).status,'closed');
  const fine=world([['careers.example.com',()=>respond(200,'<html/>','https://careers.example.com/jobs/42/data-engineer')]]);
  assert.equal((await checkOpen({url:'https://careers.example.com/jobs/42/data-engineer'},{http:fine.http})).status,'unknown','a 200 page alone does not prove it is open');
});
test('a network failure, a missing URL, or an ATS URL with no job id never blocks: the answer is unknown',async()=>{
  const down=createHttp({fetch:async()=>{throw new Error('offline');},delayMs:0,sleep:async()=>{},retries:0});
  assert.equal((await checkOpen({url:'https://boards.greenhouse.io/acme/jobs/1'},{http:down})).status,'unknown');
  assert.equal((await checkOpen({},{http:down})).status,'unknown');assert.equal((await checkOpen(null,{http:down})).status,'unknown');
  const board=world([['boards.greenhouse.io',()=>respond(200,'<html/>','https://boards.greenhouse.io/acme')]]);
  assert.equal((await checkOpen({url:'https://boards.greenhouse.io/acme'},{http:board.http})).status,'unknown','a board page with no job id falls back to the page probe');
});
