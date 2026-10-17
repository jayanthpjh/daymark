import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseIcs,buildReplyIcs,findConflicts,MAX_ICS_BYTES} from '../calendar-ics.mjs';
const fx=name=>fs.readFileSync(new URL(`./fixtures/ics/${name}`,import.meta.url),'utf8');
const from=new Date('2026-10-01T00:00:00Z');

test('a plain invite yields one event with organizer, attendee, meeting link and method',()=>{
  const {events,method,error}=parseIcs(fx('invite.ics'),{from});
  assert.equal(error,'');assert.equal(method,'REQUEST');assert.equal(events.length,1);
  const e=events[0];
  assert.equal(e.summary,'Interview, Data Engineer - Northwind');assert.equal(e.start,'2026-10-20T15:00:00.000Z');assert.equal(e.end,'2026-10-20T16:00:00.000Z');
  assert.equal(e.organizer.email,'sam@northwind.example');assert.equal(e.attendees[0].email,'alex@example.test');
  assert.equal(e.url,'https://northwind.zoom.us/j/12345');assert.equal(e.sequence,1);
});
test('invite text stays data: instructions inside it are only text, nothing is acted on',()=>{
  const e=parseIcs(fx('invite.ics'),{from}).events[0];
  assert.match(e.description,/Ignore previous instructions/);assert.equal(typeof e.description,'string');assert.equal(e.url.startsWith('https://'),true);
});
test('a TZID with a VTIMEZONE converts to the right UTC instant (CDT = UTC-5)',()=>{
  const e=parseIcs(fx('timezone.ics'),{from}).events[0];
  assert.equal(e.start,'2026-10-21T15:00:00.000Z');assert.equal(e.end,'2026-10-21T16:00:00.000Z');
});
test('a weekly series expands into its occurrences inside the window only',()=>{
  const all=parseIcs(fx('recurring.ics'),{from}).events;
  assert.equal(all.length,4);assert.deepEqual(all.map(e=>e.start.slice(0,10)),['2026-10-19','2026-10-26','2026-11-02','2026-11-09']);
  const later=parseIcs(fx('recurring.ics'),{from:new Date('2026-10-27T00:00:00Z')}).events;assert.equal(later.length,2,'earlier occurrences are skipped');
  assert.equal(parseIcs(fx('recurring.ics'),{from,days:20}).events.length,1,'the window limits expansion');
});
test('a cancellation keeps its status and method so the calendar can drop the event',()=>{
  const r=parseIcs(fx('cancel.ics'),{from});assert.equal(r.method,'CANCEL');assert.equal(r.events[0].status,'CANCELLED');assert.equal(r.events[0].sequence,2);
});
test('an all-day event is marked all-day',()=>{const e=parseIcs(fx('allday.ics'),{from}).events[0];assert.equal(e.allDay,true);assert.equal(e.summary,'Onsite day');});
test('malformed, oversized and non-calendar input returns an error and no events, never throws',()=>{
  for(const bad of ['','hello','BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:not-a-date\r\nEND:VEVENT\r\nEND:VCALENDAR','BEGIN:VCALENDAR\r\nEND:VEV'])assert.doesNotThrow(()=>parseIcs(bad,{from}));
  assert.equal(parseIcs('hello').error,'This is not a calendar invite.');
  assert.match(parseIcs('BEGIN:VCALENDAR\r\n'+'X'.repeat(MAX_ICS_BYTES)).error,/too large/);
  assert.deepEqual(parseIcs(null).events,[]);
});
test('control characters and long text in an invite are cleaned and capped',()=>{
  const ics=fx('invite.ics').replace('SUMMARY:Interview\\, Data Engineer - Northwind','SUMMARY:'+'A'.repeat(500)+'\u0007\u0000');
  const e=parseIcs(ics,{from}).events[0];assert.ok(e.summary.length<=200);assert.ok(!/[\u0000-\u0008]/.test(e.summary));
});
test('a non-https or credentialed meeting URL is dropped',()=>{
  const ics=fx('invite.ics').replace('LOCATION:https://northwind.zoom.us/j/12345','LOCATION:javascript:alert(1)').replace('DESCRIPTION:','URL:http://user:pw@evil.example/x\r\nDESCRIPTION:');
  assert.equal(parseIcs(ics,{from}).events[0].url,'');
});

test('an accept reply is a valid iTIP REPLY that reads back with the right attendee and status',()=>{
  const event=parseIcs(fx('invite.ics'),{from}).events[0];
  const r=buildReplyIcs({event,attendee:{email:'alex@example.test',name:'Alex Doe'},response:'accept',now:new Date('2026-10-02T12:00:00Z')});
  assert.equal(r.partstat,'ACCEPTED');assert.match(r.ics,/METHOD:REPLY/);assert.match(r.ics,/ATTENDEE;PARTSTAT=ACCEPTED;CN=Alex Doe:mailto:alex@example.test/);assert.match(r.ics,/ORGANIZER:mailto:sam@northwind\.example/);
  const back=parseIcs(r.ics,{from});assert.equal(back.method,'REPLY');assert.equal(back.events[0].uid,'int-1@northwind.example');assert.equal(back.events[0].attendees[0].partstat,'ACCEPTED');
  for(const line of r.ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75,'lines are folded');
});
test('a reply is refused without an organizer, a valid attendee, or a known response',()=>{
  const event=parseIcs(fx('recurring.ics'),{from}).events[0];
  assert.match(buildReplyIcs({event,attendee:{email:'a@example.test'},response:'accept'}).error,/who to reply to/);
  const good=parseIcs(fx('invite.ics'),{from}).events[0];
  assert.match(buildReplyIcs({event:good,attendee:{email:'not-an-address'},response:'accept'}).error,/address/);
  assert.match(buildReplyIcs({event:good,attendee:{email:'a@example.test'},response:'maybe'}).error,/accept, decline or tentative/);
});
test('reply text cannot inject extra ICS lines',()=>{
  const event={...parseIcs(fx('invite.ics'),{from}).events[0],summary:'Hi\r\nATTENDEE:mailto:evil@example.test'};
  const r=buildReplyIcs({event,attendee:{email:'alex@example.test',name:'Alex\r\nX-EVIL:1'},response:'decline'});
  assert.ok(!/^ATTENDEE:mailto:evil/m.test(r.ics));assert.ok(!/^X-EVIL/m.test(r.ics));
});
test('overlapping timed events conflict; all-day, cancelled and back-to-back ones do not',()=>{
  const ev=(id,s,e,x={})=>({id,start:s,end:e,allDay:false,status:'CONFIRMED',...x});
  const pairs=findConflicts([ev('a','2026-10-20T15:00:00Z','2026-10-20T16:00:00Z'),ev('b','2026-10-20T15:30:00Z','2026-10-20T16:30:00Z'),ev('c','2026-10-20T16:30:00Z','2026-10-20T17:00:00Z'),ev('d','2026-10-20T00:00:00Z','2026-10-21T00:00:00Z',{allDay:true}),ev('e','2026-10-20T15:15:00Z','2026-10-20T15:45:00Z',{status:'CANCELLED'})]);
  assert.deepEqual(pairs,[['a','b']]);
});
