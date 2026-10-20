import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mailboxRoutes } from '../mailbox-routes.mjs';
async function request({method='POST',path='/api/mailbox/drafts',body='{}',headers={},transportEnabled=true,service:overrides={}}={}) {
  let response;let called=false;const service={saveDraft:async()=>{called=true;return {ok:true};},attachment:async()=>({filename:'résumé\".html',base64:Buffer.from('<script>x</script>').toString('base64')}),...overrides};
  const req=Readable.from([body]);req.method=method;req.headers={host:'127.0.0.1:4198','content-type':'application/json',...headers};const res={writeHead:(status,h)=>{response={status,headers:h};},end:bytes=>{response.body=bytes;}};
  const route=mailboxRoutes({service,transportEnabled,readBody:async r=>{let text='';for await(const c of r)text+=c;return JSON.parse(text);},send:(res,status,data)=>{response={status,data};}});
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
test('paused Bridge transport blocks sync and outbound mail while preserving local draft work',async()=>{
  for(const path of ['/api/mailbox/sync','/api/mailbox/attempts/a1/send','/api/mailbox/attempts/a1/reconcile','/api/mailbox/attempts/a1/resolve-not-sent']){
    const r=await request({path,transportEnabled:false});assert.equal(r.status,503,path);assert.equal(r.data.code,'integration_paused',path);
  }
  const draft=await request({path:'/api/mailbox/drafts',transportEnabled:false});assert.equal(draft.status,200);assert.equal(draft.called,true);
});
test('custom-label creation and deletion remain same-origin mailbox actions',async()=>{
  const created=await request({path:'/api/mailbox/labels',body:'{"name":"Follow up"}',service:{createLabel:async name=>({created:name==='Follow up'})}});
  assert.equal(created.status,200);assert.equal(created.data.created,true);
  const deleted=await request({path:'/api/mailbox/labels/Follow%20up/delete',body:'{}',service:{deleteLabel:async name=>({deleted:name==='Follow up'})}});
  assert.equal(deleted.status,200);assert.equal(deleted.data.deleted,true);
  const blocked=await request({path:'/api/mailbox/labels',body:'{"name":"Follow up"}',headers:{origin:'https://attacker.example'},service:{createLabel:async()=>({created:true})}});
  assert.equal(blocked.status,403);
});
