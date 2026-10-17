// Calendar for the applicant: invites found in mail, plus events they add themselves.
// An RSVP only ever becomes a saved mail draft. It is sent through the same review-then-send path as any other mail.
import {createHash,randomUUID} from 'node:crypto';
import {parseIcs,buildReplyIcs,findConflicts,RSVP} from './calendar-ics.mjs';
import {MailboxError} from './mailbox-service.mjs';

const fail=(code,message,status=400)=>{throw new MailboxError(code,message,status);};
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,32);
const now=()=>new Date().toISOString();
export const KINDS=Object.freeze(['Interview','Screening','Assessment','Follow-up','Other']);
export const kindFor=summary=>/assess|take[- ]home|coding (?:test|challenge)|\btest\b/i.test(summary)?'Assessment':/interview|onsite|on-site|panel/i.test(summary)?'Interview':/screen|phone|intro|recruiter|chat|call/i.test(summary)?'Screening':/follow[- ]?up/i.test(summary)?'Follow-up':'Other';
const isIcs=a=>/calendar/i.test(a?.contentType||'')||/\.ics$/i.test(a?.filename||'');
const iso=value=>{const t=Date.parse(value);return Number.isFinite(t)?new Date(t).toISOString():'';};
const text=(value,max)=>String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const https=value=>{try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href.slice(0,500):'';}catch{return '';}};

export function createCalendarService({store,readState,identity,saveDraft}){
  const tx=fn=>store?store.transaction(fn):fail('database_required','Calendar storage needs PostgreSQL. Set DAYMARK_DATABASE_URL and restart Daymark.',503);

  // Called inside the mail-sync transaction for each incoming message. Idempotent: the same invite twice changes nothing.
  async function ingest(r,message,attachments=[]){
    if(message.direction==='outgoing')return 0;
    let added=0;
    for(const a of attachments.filter(isIcs).slice(0,3)){
      let source;try{source=Buffer.from(a.base64,'base64').toString('utf8');}catch{continue;}
      const {events,method}=parseIcs(source,{from:new Date(Date.now()-86_400_000*30)});
      for(const e of events.slice(0,20)){
        const id=hash(`${e.uid}|${e.recurrenceId}`);
        const old=await r.get('events',id);
        const cancelled=method==='CANCEL'||e.status==='CANCELLED';
        if(old&&old.sequence>e.sequence)continue;
        if(!old&&cancelled)continue;
        // A reply or a counter-proposal is not an invitation for this applicant's calendar.
        if(['REPLY','COUNTER','DECLINECOUNTER','REFRESH'].includes(method))continue;
        const record={...old,id,uid:e.uid,recurrenceId:e.recurrenceId,summary:e.summary,description:e.description,location:e.location,url:e.url,start:e.start,end:e.end,date:e.start,allDay:e.allDay,
          status:cancelled?'CANCELLED':e.status,sequence:e.sequence,organizer:e.organizer,attendees:e.attendees,source:'mail',messageId:message.id,threadId:message.threadId,
          jobId:old?.jobId||message.jobId||null,kind:old?.kind||kindFor(e.summary),rsvp:old?.rsvp||null,notes:old?.notes||'',dismissed:old?.dismissed||false,updatedAt:now()};
        await r.put('events',record);added++;
      }
    }
    return added;
  }

  const forRange=(events,{from,to})=>events.filter(e=>!e.dismissed&&(!from||Date.parse(e.end||e.start)>=from)&&(!to||Date.parse(e.start)<=to));
  return {
    ingest,
    async list({from='',to=''}={}){
      const fromMs=from?Date.parse(from):0,toMs=to?Date.parse(to):0;
      if(from&&!Number.isFinite(fromMs)||to&&!Number.isFinite(toMs))fail('invalid_range','Choose a valid date range.');
      const state=await readState();
      const events=await tx(r=>r.list('events',{limit:200}));
      const shown=forRange(events,{from:fromMs,to:toMs}).sort((a,b)=>a.start.localeCompare(b.start));
      const jobs=new Map((state.jobs||[]).map(j=>[j.id,j]));
      return {events:shown.map(e=>({...e,company:jobs.get(e.jobId)?.company||'',role:jobs.get(e.jobId)?.role||''})),conflicts:findConflicts(shown)};
    },
    // Events that start in the next `hours`, for in-app reminders. Cancelled and dismissed events are never reminded.
    async upcoming({hours=24,at=Date.now()}={}){
      const events=await tx(r=>r.list('events',{limit:200}));
      return events.filter(e=>!e.dismissed&&e.status!=='CANCELLED'&&!e.allDay&&Date.parse(e.start)>=at&&Date.parse(e.start)<=at+hours*3_600_000).sort((a,b)=>a.start.localeCompare(b.start)).map(({id,summary,start,end,url,jobId,kind})=>({id,summary,start,end,url,jobId,kind}));
    },
    async create(input){
      const summary=text(input?.summary,200),start=iso(input?.start),end=iso(input?.end||input?.start);
      if(!summary||!start)fail('invalid_event','Enter a title and a start time.');
      if(Date.parse(end)<Date.parse(start))fail('invalid_event','The end must be after the start.');
      const kind=KINDS.includes(input?.kind)?input.kind:kindFor(summary);
      if(input?.jobId){const state=await readState();if(!state.jobs.some(j=>j.id===input.jobId))fail('not_found','Application not found.',404);}
      const event={id:randomUUID(),uid:`${randomUUID()}@daymark.local`,recurrenceId:'',summary,description:'',location:text(input?.location,300),url:https(input?.url),start,end,date:start,allDay:false,status:'CONFIRMED',sequence:0,organizer:null,attendees:[],source:'manual',jobId:input?.jobId||null,kind,rsvp:null,notes:text(input?.notes,1000),dismissed:false,updatedAt:now()};
      await tx(r=>r.put('events',event));return {event};
    },
    async update(id,patch){
      return tx(async r=>{
        const e=await r.get('events',id);if(!e)fail('not_found','Event not found.',404);
        if(typeof patch?.notes==='string')e.notes=text(patch.notes,1000);
        if('kind' in (patch||{})){if(!KINDS.includes(patch.kind))fail('invalid_event','Choose a valid kind.');e.kind=patch.kind;}
        if('jobId' in (patch||{})){if(patch.jobId){const state=await readState();if(!state.jobs.some(j=>j.id===patch.jobId))fail('not_found','Application not found.',404);}e.jobId=patch.jobId||null;}
        // Times, title and place of an invite belong to the organizer; only events the applicant made can be rescheduled here.
        if(e.source==='manual'){
          if(patch?.summary!==undefined){const s=text(patch.summary,200);if(!s)fail('invalid_event','Enter a title.');e.summary=s;}
          if(patch?.start!==undefined||patch?.end!==undefined){const s=iso(patch.start??e.start),en=iso(patch.end??e.end);if(!s||!en||Date.parse(en)<Date.parse(s))fail('invalid_event','Enter a valid time range.');e.start=s;e.end=en;e.date=s;}
          if(patch?.location!==undefined)e.location=text(patch.location,300);
          if(patch?.url!==undefined)e.url=https(patch.url);
        }
        e.updatedAt=now();await r.put('events',e);return {event:e};
      });
    },
    async remove(id){
      return tx(async r=>{
        const e=await r.get('events',id);if(!e)return {removed:true};
        // An invite stays recorded (hidden) so a later mail sync does not bring it back as new.
        if(e.source==='manual')await r.remove('events',id);else await r.put('events',{...e,dismissed:true,updatedAt:now()});
        return {removed:true};
      });
    },
    // Saves a reply as a mail DRAFT. Nothing is sent: the applicant reviews and sends it from Mail.
    async rsvp(id,response){
      if(!Object.hasOwn(RSVP,response))fail('invalid_action','Choose accept, decline or tentative.');
      const e=await tx(r=>r.get('events',id));if(!e)fail('not_found','Event not found.',404);
      if(e.source!=='mail')fail('invalid_action','Only invitations from mail can be answered.');
      if(e.status==='CANCELLED')fail('invalid_action','This invitation was cancelled.');
      const email=await identity();
      const attendee=e.attendees.find(a=>a.email===String(email).toLowerCase())||{email:String(email).toLowerCase(),name:''};
      const built=buildReplyIcs({event:e,attendee,response});
      if(built.error)fail('invalid_action',built.error);
      const verb={ACCEPTED:'Accepted',DECLINED:'Declined',TENTATIVE:'Tentative'}[built.partstat];
      const saved=await saveDraft(null,{to:e.organizer.email,subject:`${verb}: ${e.summary}`.slice(0,300),body:`${verb} for "${e.summary}" on ${new Date(e.start).toUTCString()}.`,attachments:[],calendarReply:{ics:built.ics,partstat:built.partstat,eventId:e.id},replyTo:e.messageId});
      await tx(async r=>{const cur=await r.get('events',id);if(cur)await r.put('events',{...cur,rsvp:{response,draftId:saved.draft.id,at:now(),sent:false},updatedAt:now()});});
      return saved;
    },
  };
}
