import test from 'node:test';
import assert from 'node:assert/strict';
import { createMailboxTransport } from '../mailbox-transport.mjs';
function make({uids=[1,2,3],validity='one',size=100,crash=false}={}) {
  const fetched=[];let released=0,loggedOut=0;
  const client={mailbox:{uidValidity:validity,uidNext:Math.max(0,...uids)+1},connect:async()=>{},logout:async()=>{loggedOut++;},list:async()=>[{path:'INBOX'}],getMailboxLock:async()=>({release(){released++;}}),search:async(query)=>{const [lo,hi]=query.uid.split(':').map(Number);return uids.filter(v=>v>=lo&&v<=hi);},fetchOne:async(uid,what)=>{if(crash)throw new Error('connection lost');if(what.source){fetched.push(uid);return {source:Buffer.from(`From: recruiter@example.test\r\nTo: applicant@example.test\r\nSubject: Interview invitation\r\nMessage-ID: <${uid}@example.test>\r\nContent-Type: text/html\r\n\r\n<p>Hello</p><a href="https://calendar.example.test/book">Schedule</a><img src="https://tracker.example.test/pixel">`)};}return {size,flags:new Set(),internalDate:new Date('2026-10-16T10:00:00Z'),envelope:{subject:'large',messageId:`<${uid}@example.test>`}};}};
  const transport=createMailboxTransport({client:async()=>client,readEnv:async()=>({PROTON_BRIDGE_USER:'applicant@example.test'})});return {transport,fetched,get released(){return released;},get loggedOut(){return loggedOut;}};
}
test('initial sync imports recent 50; incremental and older windows never skip sparse UIDs',async()=>{
  const f=make({uids:Array.from({length:123},(_,i)=>i*3+1)});const first=await f.transport.receive({});assert.equal(first.messages.length,50);assert.equal(first.cursor.folders.INBOX.hasOlder,true);
  const second=await f.transport.receive(first.cursor);assert.equal(second.messages.length,0);
  const older=await f.transport.receive(first.cursor,{older:true});assert.equal(older.messages.length,50);assert.equal(older.cursor.folders.INBOX.lastUid,first.cursor.folders.INBOX.lastUid);
  const last=await f.transport.receive(older.cursor,{older:true});assert.equal(last.messages.length,23);assert.equal(last.cursor.folders.INBOX.hasOlder,false);
  const stable=await f.transport.receive(last.cursor);assert.equal(stable.cursor.folders.INBOX.hasOlder,false);
});
test('validity change rebaselines; empty mailbox does not fetch; errors always release and logout',async()=>{
  const empty=make({uids:[]});assert.equal((await empty.transport.receive({})).messages.length,0);assert.equal(empty.released,1);assert.equal(empty.loggedOut,1);
  const changed=make({validity:'new'});assert.equal((await changed.transport.receive({folders:{INBOX:{validity:'old',lastUid:999,oldest:999}}})).messages.length,3);
  const broken=make({crash:true});await assert.rejects(broken.transport.receive({}),/connection lost/);assert.equal(broken.released,1);assert.equal(broken.loggedOut,1);
});
test('oversized MIME is never downloaded; safe scheduling links survive HTML-to-text conversion',async()=>{
  const big=make({size:20*1024*1024});const result=await big.transport.receive({});assert.equal(big.fetched.length,0);assert.equal(result.messages[0].oversized,true);
  const normal=make({uids:[1]});const m=(await normal.transport.receive({})).messages[0];assert.match(m.text,/Hello/);assert.deepEqual(m.links,['https://calendar.example.test/book']);assert.ok(!m.text.includes('tracker.example.test'));
});
