import test from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {createAgentHistory} from '../agent-history.mjs';
import { createMailboxStore } from '../mailbox-store.mjs';
import { createMailboxService } from '../mailbox-service.mjs';
import { demoMailboxTransport } from '../mailbox-demo.mjs';
const url=process.env.DAYMARK_TEST_MAIL_DATABASE_URL;
test('dedicated PostgreSQL tables preserve atomicity, filtering, threading, revisions and send claims', {skip:!url}, async()=>{
  const admin=new Pool({connectionString:url});const schema='mail_test_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});const one=await createMailboxStore({pool});const two=await createMailboxStore({pool});
  const options={transport:demoMailboxTransport(),readState:async()=>({jobs:[{id:'a'},{id:'b'},{id:'c'}],applications:[]}),log:()=>{}};
  const a=createMailboxService({...options,store:one});const b=createMailboxService({...options,store:two});
  try {
    await a.sync();assert.equal((await a.list()).threads.length,3);
    assert.equal((await a.list({query:'technical assessment'})).threads.length,1);
    assert.equal((await a.list({jobId:'b'})).threads.length,1);
    assert.equal((await a.list({query:'%'})).threads.length,0);
    assert.equal((await a.list({folder:'Needs reply'})).threads.length,2);
    await assert.rejects(one.transaction(async r=>{await r.put('sync',{id:'rollback-test',value:1});throw new Error('rollback');}));
    assert.equal(await two.transaction(r=>r.get('sync','rollback-test')),null);
    const {draft:d}=await a.saveDraft(null,{to:'test@example.test',subject:'SQL integration',body:'hello',attachments:[{filename:'test.txt',base64:Buffer.from('private-file-bytes').toString('base64')}]});
    const summaries=await one.transaction(r=>r.list('drafts',{metadata:true}));assert.equal('base64' in summaries[0].attachments[0],false);
    const updates=await Promise.allSettled([a.saveDraft(d.id,{...d,body:'A'}),b.saveDraft(d.id,{...d,body:'B'})]);assert.equal(updates.filter(r=>r.status==='fulfilled').length,1);
    const current=(await a.draft(d.id)).draft;const {attempt}=await a.review(d.id,current.revision);
    let sends=0;const counted={...options.transport,send:async m=>{sends++;return {accepted:[m.to],rejected:[]};}};
    const c=createMailboxService({...options,store:one,transport:counted});const e=createMailboxService({...options,store:two,transport:counted});
    await Promise.all([c.send(attempt.id),e.send(attempt.id)]);assert.equal(sends,1);
    const sent=(await a.list({folder:'Sent'})).threads;assert.equal(sent.length,1);
    assert.equal((await a.list({folder:'Drafts'})).drafts.length,0);
    let modelCalls=0;const agent={message:async()=>{modelCalls++;return {reply:'Saved answer',ran:[],refused:[]};}};
    const chatA=createAgentHistory({store:one,agent,log:()=>{}});const chatB=createAgentHistory({store:two,agent,log:()=>{}});
    const conversation=await chatA.create();const request={conversationId:conversation.id,requestId:randomUUID(),message:'Explain the next step'};
    await Promise.all([chatA.message(request),chatB.message(request)]);assert.equal(modelCalls,1);
    assert.equal((await chatB.get(conversation.id)).turns[0].reply,'Saved answer');
    const chatSummaries=await two.transaction(r=>r.list('conversations',{metadata:true}));assert.equal('turns' in chatSummaries[0],false);

  }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
