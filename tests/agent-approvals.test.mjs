import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createMailboxStore} from '../mailbox-store.mjs';
import {createApprovalLedger,APPROVAL_TTL_MS} from '../agent-approvals.mjs';

async function setup(t,clock={t:Date.parse('2026-10-20T12:00:00Z')}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-approvals-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'a.json');
  const make=async()=>createApprovalLedger({store:await createMailboxStore({demoFile:file}),now:()=>clock.t});
  return {ledger:await make(),make,clock};
}
const card={name:'submit_application',args:{taskId:'t1'},summary:'Submit this application (Acme)',binding:'tok-1'};
const runs=()=>{const log=[];return {log,verify:async()=>'tok-1',run:async r=>{log.push(r.name);return {message:'Submitted.'};}};};

test('a proposal is saved as pending and runs nothing',async t=>{
  const {ledger}=await setup(t);const view=await ledger.propose(card);
  assert.equal(view.status,'pending');assert.equal((await ledger.pending()).length,1);assert.equal(view.summary,card.summary);
  assert.equal('args' in view,false,'the public card does not echo raw arguments');
});
test('accepting runs the action once and records who approved; a second accept does nothing',async t=>{
  const {ledger}=await setup(t);const {id}=await ledger.propose(card);const h=runs();
  const first=await ledger.accept(id,h);assert.equal(first.status,'done');
  const second=await ledger.accept(id,h);assert.equal(second.status,'not_pending');
  assert.deepEqual(h.log,['submit_application']);
  const [entry]=await ledger.activity();assert.equal(entry.actor,'agent');assert.deepEqual(entry.history.map(x=>x.status),['pending','running','done']);
  assert.equal((await ledger.pending()).length,0);
});
test('two accepts at the same moment still run the action once',async t=>{
  const {ledger}=await setup(t);const {id}=await ledger.propose(card);const h=runs();
  const results=await Promise.all([ledger.accept(id,h),ledger.accept(id,h)]);
  assert.equal(h.log.length,1);assert.deepEqual(results.map(r=>r.status).sort(),['done','not_pending']);
});
test('a card whose binding no longer matches is not run and says why',async t=>{
  const {ledger}=await setup(t);const {id}=await ledger.propose(card);let ran=false;
  const out=await ledger.accept(id,{verify:async()=>'tok-2',run:async()=>{ran=true;}});
  assert.equal(out.status,'conflict');assert.match(out.message,/changed after the card was shown/);assert.equal(ran,false);
  assert.equal((await ledger.accept(id,runs())).status,'not_pending','a conflicted card cannot be retried');
});
test('an ignored card expires and cannot run later',async t=>{
  const {ledger,clock}=await setup(t);const {id}=await ledger.propose(card);
  clock.t+=APPROVAL_TTL_MS+1;const h=runs();
  assert.equal((await ledger.accept(id,h)).status,'expired');assert.equal(h.log.length,0);assert.equal((await ledger.pending()).length,0);
});
test('a declined card can never run',async t=>{
  const {ledger}=await setup(t);const {id}=await ledger.propose(card);
  assert.equal((await ledger.decline(id)).status,'declined');const h=runs();
  assert.equal((await ledger.accept(id,h)).status,'not_pending');assert.equal(h.log.length,0);
  assert.equal((await ledger.decline(id)).status,'not_pending');
});
test('a failing action is recorded as failed with a short message and is not retried',async t=>{
  const {ledger}=await setup(t);const {id}=await ledger.propose(card);let calls=0;
  const out=await ledger.accept(id,{verify:async()=>'tok-1',run:async()=>{calls++;throw new Error('Browser session closed. '+'x'.repeat(500));}});
  assert.equal(out.status,'failed');assert.ok(out.message.length<=300);
  await ledger.accept(id,{verify:async()=>'tok-1',run:async()=>{calls++;}});assert.equal(calls,1);
});
test('approvals survive a restart: a pending card is still there and a finished one stays finished',async t=>{
  const {ledger,make}=await setup(t);const a=await ledger.propose(card);const b=await ledger.propose({...card,summary:'Other',binding:'tok-1'});
  await ledger.accept(b.id,runs());
  const again=await make();
  assert.deepEqual((await again.pending()).map(x=>x.id),[a.id]);assert.equal((await again.get(b.id)).status,'done');
});
test('bad ids are refused before touching storage',async t=>{
  const {ledger}=await setup(t);
  for(const bad of ['', '../x', 'nope'])await assert.rejects(ledger.accept(bad,runs()),/valid approval/);
  await assert.rejects(ledger.accept('11111111-1111-1111-1111-111111111111',runs()),/not found/i);
  await assert.rejects(createApprovalLedger({}).propose(card),/PostgreSQL/);
});
