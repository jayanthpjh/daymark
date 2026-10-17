import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mailboxRoutes } from '../mailbox-routes.mjs';
async function request({method='POST',path='/api/mailbox/drafts',body='{}',headers={}}={}) {
  let response;let called=false;const service={saveDraft:async()=>{called=true;return {ok:true};},attachment:async()=>({filename:'résumé\".html',base64:Buffer.from('<script>x</script>').toString('base64')})};
  const req=Readable.from([body]);req.method=method;req.headers={host:'127.0.0.1:4198','content-type':'application/json',...headers};const res={writeHead:(status,h)=>{response={status,headers:h};},end:bytes=>{response.body=bytes;}};
  const route=mailboxRoutes({service,readBody:async r=>{let text='';for await(const c of r)text+=c;return JSON.parse(text);},send:(res,status,data)=>{response={status,data};}});
  await route(req,res,new URL(path,'http://127.0.0.1:4198'));return {...response,called};
}
test('cross-origin writes, non-JSON objects, and malformed JSON are rejected visibly',async()=>{
  assert.equal((await request({headers:{origin:'https://attacker.example'}})).status,403);
  assert.equal((await request({headers:{'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await request({headers:{'content-type':'text/plain'}})).status,403);
  assert.equal((await request({body:'null'})).status,400);assert.equal((await request({body:'{'})).status,400);
  assert.equal((await request()).called,true);
});
test('downloads are attachment-only, nosniff, and sandboxed regardless of filename',async()=>{
  const r=await request({method:'GET',path:'/api/mailbox/attachments/test'});assert.equal(r.status,200);assert.equal(r.headers['content-type'],'application/octet-stream');assert.match(r.headers['content-disposition'],/^attachment;/);assert.equal(r.headers['x-content-type-options'],'nosniff');assert.match(r.headers['content-security-policy'],/sandbox/);
});
