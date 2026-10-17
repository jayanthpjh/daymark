// Tracker: where each application stands, derived from what Daymark already records (statuses, mail, calendar).
// Nothing here changes stored statuses. "Ghosted" is a display stage worked out from quiet days, and it can be undone.
import {detectATSAdapter} from './ats-adapters.mjs';

export const STAGES=Object.freeze(['saved','applied','screening','assessment','interviewing','offer','rejected','withdrawn','ghosted']);
export const STAGE_LABELS=Object.freeze({saved:'Saved',applied:'Applied',screening:'Screening',assessment:'Assessment',interviewing:'Interviewing',offer:'Offer',rejected:'Rejected',withdrawn:'Withdrawn',ghosted:'Ghosted'});
export const GHOST_DAYS=21;
const DAY=86_400_000;
const time=value=>{const t=Date.parse(value);return Number.isFinite(t)?t:0;};
// A confirmation says "we received it". It is not a reply from a person, so it does not stop the quiet-days clock.
const isResponse=categories=>(categories||[]).some(c=>!['Application confirmation','Verification','Other'].includes(c));

export function stageFor({application,mail=[],events=[],now=Date.now(),ghostDays=GHOST_DAYS}){
  const status=application.status||'not_started';
  const flags=[];
  if(status==='skipped')return null;
  const submittedAt=time(application.submittedAt)||time((application.statusHistory||[]).filter(h=>h.after==='submitted').at(-1)?.at);
  const replies=mail.filter(m=>time(m.at)>=submittedAt&&isResponse(m.categories));
  const lastReply=replies.reduce((max,m)=>Math.max(max,time(m.at)),0);
  const assessmentSeen=replies.some(m=>(m.categories||[]).includes('Assessment'))||events.some(e=>e.kind==='Assessment'&&e.status!=='CANCELLED'&&!e.dismissed);
  let stage;
  if(status==='offer')stage='offer';
  else if(status==='rejected')stage='rejected';
  else if(status==='withdrawn')stage='withdrawn';
  else if(status==='interview')stage='interviewing';
  else if(status==='screening')stage=assessmentSeen?'assessment':'screening';
  else if(status==='submitted'||status==='unconfirmed'){
    stage=assessmentSeen?'assessment':'applied';
    if(status==='unconfirmed')flags.push('unconfirmed');
  }else stage='saved';
  // Quiet too long after submitting: show Ghosted unless the applicant undid it (the clock then restarts from the undo).
  let quietDays=0;
  if(stage==='applied'&&submittedAt){
    const since=Math.max(submittedAt,lastReply,time(application.tracker?.ghostUndoneAt));
    quietDays=Math.max(0,Math.floor((now-since)/DAY));
    if(application.tracker?.ghostedAt&&time(application.tracker.ghostedAt)>time(application.tracker?.ghostUndoneAt)||quietDays>=ghostDays&&!lastReply){stage='ghosted';flags.push(application.tracker?.ghostedAt?'marked by you':'automatic');}
  }
  const lastActivityAt=Math.max(time(application.updatedAt),submittedAt,lastReply,...events.map(e=>time(e.start)<=now?time(e.start):0));
  return {jobId:application.jobId,applicationId:application.id,company:application.company||'',role:application.role||'',stage,flags,quietDays,submittedAt:submittedAt?new Date(submittedAt).toISOString():null,lastActivityAt:lastActivityAt?new Date(lastActivityAt).toISOString():null,source:application.source||'',url:application.url||''};
}

export function timelineFor({application,mail=[],events=[],tasks=[]}){
  const items=[];
  for(const h of application.statusHistory||[])items.push({at:h.at,kind:'status',text:`Status: ${(h.before||'not started').replace(/_/g,' ')} to ${String(h.after).replace(/_/g,' ')}`,source:h.source||''});
  for(const m of mail)items.push({at:m.at,kind:'mail',text:m.subject||'Mail',categories:m.categories||[]});
  for(const e of events)items.push({at:e.start,kind:'event',text:`${e.kind}: ${e.summary}`,cancelled:e.status==='CANCELLED'});
  for(const t of tasks)if(t.type==='fill'&&t.submitAttemptedAt)items.push({at:t.submitAttemptedAt,kind:'task',text:'Submit clicked'});
  for(const n of application.tracker?.notes||[])items.push({at:n.at,kind:'note',text:n.text,id:n.id});
  return items.filter(i=>time(i.at)).sort((a,b)=>time(b.at)-time(a.at));
}

const adapterOf=url=>{try{return detectATSAdapter(new URL(url).hostname)?.id||'other';}catch{return 'other';}};
const REACHED_REPLY=new Set(['screening','assessment','interviewing','offer','rejected']);
const REACHED_INTERVIEW=new Set(['interviewing','offer']);
const weekStart=ms=>{const d=new Date(ms);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};

// Rows are {stage, submittedAt, ats, source, tailoringMode, resume}. Rates use submitted applications only.
export function funnel(rows,{minSample=5}={}){
  const submitted=rows.filter(r=>r.submittedAt);
  const count=pred=>submitted.filter(pred).length;
  const summary=group=>({n:group.length,replied:group.filter(r=>REACHED_REPLY.has(r.stage)).length,interviewed:group.filter(r=>REACHED_INTERVIEW.has(r.stage)).length,
    replyRate:group.length?group.filter(r=>REACHED_REPLY.has(r.stage)).length/group.length:0,interviewRate:group.length?group.filter(r=>REACHED_INTERVIEW.has(r.stage)).length/group.length:0,lowSample:group.length<minSample});
  const by=key=>{const groups=new Map();for(const r of submitted){const k=r[key]||'unknown';(groups.get(k)||groups.set(k,[]).get(k)).push(r);}return Object.fromEntries([...groups].sort((a,b)=>b[1].length-a[1].length).map(([k,v])=>[k,summary(v)]));};
  const weeks=new Map();
  for(const r of submitted){const w=weekStart(time(r.submittedAt));const cur=weeks.get(w)||{week:w,submitted:0,replied:0,interviewed:0};cur.submitted++;if(REACHED_REPLY.has(r.stage))cur.replied++;if(REACHED_INTERVIEW.has(r.stage))cur.interviewed++;weeks.set(w,cur);}
  return {total:summary(submitted),stages:Object.fromEntries(STAGES.map(s=>[s,rows.filter(r=>r.stage===s).length])),ghosted:count(r=>r.stage==='ghosted'),
    weekly:[...weeks.values()].sort((a,b)=>a.week.localeCompare(b.week)).slice(-12),byAts:by('ats'),bySource:by('source'),byTailoring:by('tailoringMode'),byResume:by('resume')};
}

// Builds the whole tracker view from stored state plus calendar events.
export function buildTracker(state,{events=[],now=Date.now(),ghostDays=GHOST_DAYS}={}){
  const mailByJob=new Map();for(const m of state.mailEvents||[]){(mailByJob.get(m.jobId)||mailByJob.set(m.jobId,[]).get(m.jobId)).push(m);}
  const eventsByJob=new Map();for(const e of events){if(!e.jobId)continue;(eventsByJob.get(e.jobId)||eventsByJob.set(e.jobId,[]).get(e.jobId)).push(e);}
  const prepByJob=new Map();for(const t of state.tasks||[])if(t.type==='prepare'&&t.jobId&&!prepByJob.has(t.jobId))prepByJob.set(t.jobId,t);
  const rows=[];
  for(const application of state.applications||[]){
    const mail=mailByJob.get(application.jobId)||[];const ev=eventsByJob.get(application.jobId)||[];
    const row=stageFor({application,mail,events:ev,now,ghostDays});if(!row)continue;
    const prep=prepByJob.get(application.jobId);
    rows.push({...row,ats:adapterOf(application.url),tailoringMode:prep?.artifacts?.tailoringMode||prep?.tailoringMode||'',resume:prep?.resumeMode||'',
      notes:(application.tracker?.notes||[]).length,nextEvent:ev.filter(e=>e.status!=='CANCELLED'&&time(e.start)>=now).sort((a,b)=>a.start.localeCompare(b.start))[0]?.start||null});
  }
  rows.sort((a,b)=>time(b.lastActivityAt)-time(a.lastActivityAt));
  return {rows,funnel:funnel(rows),stages:STAGES.map(id=>({id,label:STAGE_LABELS[id],count:rows.filter(r=>r.stage===id).length})),ghostDays};
}
