import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createMailboxStore} from '../mailbox-store.mjs';
import {createMailboxService} from '../mailbox-service.mjs';
import {createCalendarService,kindFor} from '../calendar-service.mjs';
import {parseIcs} from '../calendar-ics.mjs';

const ics=name=>fs.readFile(new URL(`./fixtures/ics/${name}`,import.meta.url),'utf8');
const b64=text=>Buffer.from(text).toString('base64');
const invite=async(name='invite.ics')=>({id:'att-'+name,filename:'invite.ics',contentType:'text/calendar',base64:b64(await ics(name))});
const msg=(id='m1',extra={})=>({id,threadId:'th1',direction:'incoming',jobId:'job1',...extra});

async function setup(t,{sent=[]}={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daymark-cal-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const store=await createMailboxStore({demoFile:path.join(dir,'m.json')});
  const state={jobs:[{id:'job1',company:'Northwind',role:'Data Engineer'}],applications:[]};
  const transport={identity:async()=>'alex@example.test',receive:async()=>({messages:[],cursor:{folders:{}}}),send:async m=>{sent.push(m);return {accepted:[m.to],rejected:[]};},findSent:async()=>true};
  let mailbox;
  const calendar=createCalendarService({store,readState:async()=>state,identity:()=>transport.identity(),saveDraft:(id,input)=>mailbox.saveDraft(id,input)});
  mailbox=createMailboxService({store,transport,readState:async()=>state,calendar,log:()=>{}});
  const ingest=async(message,atts)=>store.transaction(async r=>{await r.put('messages',{messageId:`<${message.id}@x>`,from:'Sam',senderAddress:'sam@northwind.example',subject:'Invite',text:'',date:new Date().toISOString(),categories:['Interview'],...message});return calendar.ingest(r,message,atts);});
  return {store,calendar,mailbox,ingest,sent};
}
const wide={from:'2020-01-01T00:00:00Z',to:'2099-01-01T00:00:00Z'};

test('an invite in mail becomes a calendar event linked to its application, once',async t=>{
  const {calendar,ingest}=await setup(t);
  assert.equal(await ingest(msg(),[await invite()]),1);
  assert.equal(await ingest(msg(),[await invite()]),1,'second ingest reports the event but changes nothing');
  const {events}=await calendar.list(wide);
  assert.equal(events.length,1);assert.equal(events[0].company,'Northwind');assert.equal(events[0].kind,'Interview');assert.equal(events[0].source,'mail');assert.equal(events[0].url,'https://northwind.zoom.us/j/12345');
});
test('an invite without a calendar content type is still found by its .ics name; other attachments are ignored',async t=>{
  const {calendar,ingest}=await setup(t);
  await ingest(msg(),[{id:'a',filename:'resume.pdf',contentType:'application/pdf',base64:b64('%PDF')},{id:'b',filename:'meeting.ics',contentType:'',base64:b64(await ics('timezone.ics'))}]);
  assert.equal((await calendar.list(wide)).events.length,1);
});
test('a cancellation removes the meeting from view; an older update cannot undo it; an unknown cancellation adds nothing',async t=>{
  const {calendar,ingest}=await setup(t);
  await ingest(msg(),[await invite()]);
  await ingest(msg('m2'),[await invite('cancel.ics')]);
  let {events}=await calendar.list(wide);assert.equal(events[0].status,'CANCELLED');
  await ingest(msg('m3'),[await invite()]);
  ({events}=await calendar.list(wide));assert.equal(events[0].status,'CANCELLED','sequence 1 does not override sequence 2');
  assert.deepEqual((await calendar.upcoming({hours:24*365*30,at:Date.parse('2026-10-01')})),[],'cancelled events are never reminded');
  const fresh=await setup(t);await fresh.ingest(msg(),[await invite('cancel.ics')]);assert.equal((await fresh.calendar.list(wide)).events.length,0);
});
test('mail the applicant sent, and replies from others, never create events',async t=>{
  const {calendar,ingest}=await setup(t);
  await ingest(msg('o',{direction:'outgoing'}),[await invite()]);
  const reply=(await ics('invite.ics')).replace('METHOD:REQUEST','METHOD:REPLY');
  await ingest(msg('r'),[{id:'x',filename:'reply.ics',contentType:'text/calendar',base64:b64(reply)}]);
  assert.equal((await calendar.list(wide)).events.length,0);
});
test('overlapping interviews are reported as a conflict',async t=>{
  const {calendar,ingest}=await setup(t);
  await ingest(msg(),[await invite()]);
  const overlap=(await ics('invite.ics')).replace(/int-1@northwind\.example/,'int-2@x').replace('150000Z','153000Z').replace('160000Z','163000Z');
  await ingest(msg('m2'),[{id:'z',filename:'i2.ics',contentType:'text/calendar',base64:b64(overlap)}]);
  const {events,conflicts}=await calendar.list(wide);assert.equal(events.length,2);assert.equal(conflicts.length,1);
});
test('manual events validate input, can be rescheduled, and are removed for real; invites are only hidden',async t=>{
  const {calendar,ingest,store}=await setup(t);
  await assert.rejects(calendar.create({summary:'',start:'2026-10-20T10:00:00Z'}),/title and a start/);
  await assert.rejects(calendar.create({summary:'x',start:'2026-10-20T10:00:00Z',end:'2026-10-20T09:00:00Z'}),/end must be after/);
  await assert.rejects(calendar.create({summary:'x',start:'2026-10-20T10:00:00Z',jobId:'nope'}),/Application not found/);
  const {event}=await calendar.create({summary:'Follow up with Northwind',start:'2026-10-22T14:00:00Z',url:'javascript:alert(1)'});
  assert.equal(event.kind,'Follow-up');assert.equal(event.url,'');
  const moved=await calendar.update(event.id,{start:'2026-10-23T14:00:00Z',end:'2026-10-23T14:15:00Z'});assert.equal(moved.event.start,'2026-10-23T14:00:00.000Z');
  await calendar.remove(event.id);assert.equal((await calendar.list(wide)).events.length,0);
  await ingest(msg(),[await invite()]);const id=(await calendar.list(wide)).events[0].id;
  await assert.rejects(calendar.update(id,{kind:'Bogus'}),/valid kind/);
  const kept=await calendar.update(id,{start:'2030-01-01T00:00:00Z',summary:'Hijacked'});assert.equal(kept.event.summary.startsWith('Interview'),true,'the organizer owns invite times and titles');
  await calendar.remove(id);assert.equal((await calendar.list(wide)).events.length,0);
  await ingest(msg('again'),[await invite()]);assert.equal((await calendar.list(wide)).events.length,0,'a dismissed invite does not come back on the next sync');
  assert.equal((await store.transaction(r=>r.list('events',{limit:50}))).length,1);
});
test('upcoming lists only events starting inside the window',async t=>{
  const {calendar,ingest}=await setup(t);await ingest(msg(),[await invite()]);
  const base=Date.parse('2026-10-20T00:00:00Z');
  assert.equal((await calendar.upcoming({hours:24,at:base})).length,1);
  assert.equal((await calendar.upcoming({hours:6,at:base})).length,0);
  assert.equal((await calendar.upcoming({hours:24,at:Date.parse('2026-10-21T00:00:00Z')})).length,0);
});
test('event kinds are read from the title',()=>{
  assert.equal(kindFor('Take-home assessment due'),'Assessment');assert.equal(kindFor('Final interview'),'Interview');assert.equal(kindFor('Recruiter call'),'Screening');assert.equal(kindFor('Lunch'),'Other');
});

test('RSVP saves a reply draft and sends nothing',async t=>{
  const sent=[];const {calendar,mailbox,ingest}=await setup(t,{sent});
  await ingest(msg(),[await invite()]);const id=(await calendar.list(wide)).events[0].id;
  const {draft}=await calendar.rsvp(id,'accept');
  assert.equal(draft.to,'sam@northwind.example');assert.match(draft.subject,/^Accepted: Interview/);assert.equal(draft.calendarReply.partstat,'ACCEPTED');
  assert.equal(sent.length,0,'nothing is sent by answering');
  assert.equal((await calendar.list(wide)).events[0].rsvp.sent,false);
  const attempts=await mailbox.draft(draft.id);assert.equal(attempts.draft.sendAttemptId,null,'no send attempt exists until the applicant reviews');
  await assert.rejects(mailbox.send('does-not-exist'),/not found/i);assert.equal(sent.length,0);
});
test('a reviewed RSVP is sent once as a calendar reply part, and the event shows it was sent',async t=>{
  const sent=[];const {calendar,mailbox,ingest}=await setup(t,{sent});
  await ingest(msg(),[await invite()]);const id=(await calendar.list(wide)).events[0].id;
  const {draft}=await calendar.rsvp(id,'decline');
  const {attempt}=await mailbox.review(draft.id,draft.revision);
  assert.equal(sent.length,0,'review alone does not send');
  await mailbox.send(attempt.id);await mailbox.send(attempt.id);
  assert.equal(sent.length,1,'sent exactly once');
  assert.equal(sent[0].icalEvent.method,'REPLY');assert.equal(parseIcs(sent[0].icalEvent.content).events[0].attendees[0].partstat,'DECLINED');
  assert.equal((await calendar.list(wide)).events[0].rsvp.sent,true);
});
test('RSVP is refused for manual events, cancelled invites, unknown responses and missing organizers',async t=>{
  const {calendar,ingest}=await setup(t);
  const {event}=await calendar.create({summary:'Mine',start:'2026-10-22T14:00:00Z'});
  await assert.rejects(calendar.rsvp(event.id,'accept'),/Only invitations from mail/);
  await ingest(msg(),[await invite()]);const id=(await calendar.list(wide)).events.find(e=>e.source==='mail').id;
  await assert.rejects(calendar.rsvp(id,'maybe'),/accept, decline or tentative/);
  await assert.rejects(calendar.rsvp('nope','accept'),/Event not found/);
  await ingest(msg('c'),[await invite('cancel.ics')]);await assert.rejects(calendar.rsvp(id,'accept'),/cancelled/);
  const noOrg=await setup(t);await noOrg.ingest(msg(),[{id:'w',filename:'w.ics',contentType:'text/calendar',base64:b64(await ics('recurring.ics'))}]);
  const rid=(await noOrg.calendar.list(wide)).events[0].id;await assert.rejects(noOrg.calendar.rsvp(rid,'accept'),/who to reply to/);
});
test('a calendar reply naming a different address than the sender is refused at review',async t=>{
  const {calendar,mailbox,ingest}=await setup(t);
  await ingest(msg(),[await invite()]);const id=(await calendar.list(wide)).events[0].id;
  const {draft}=await calendar.rsvp(id,'accept');
  const forged=draft.calendarReply.ics.replace('mailto:alex@example.test','mailto:someone-else@example.test');
  const {draft:d2}=await mailbox.saveDraft(draft.id,{to:draft.to,subject:draft.subject,body:draft.body,attachments:[],calendarReply:{ics:forged,eventId:id},revision:draft.revision});
  await assert.rejects(mailbox.review(d2.id,d2.revision),/different address/);
});
test('a draft cannot carry a calendar part that is not a single REPLY',async t=>{
  const {mailbox}=await setup(t);
  const base={to:'a@example.test',subject:'s',body:'b',attachments:[]};
  await assert.rejects(mailbox.saveDraft(null,{...base,calendarReply:{ics:await ics('invite.ics')}}),/calendar reply is invalid/);
  await assert.rejects(mailbox.saveDraft(null,{...base,calendarReply:{ics:'x'.repeat(30000)}}),/calendar reply is invalid/);
});
