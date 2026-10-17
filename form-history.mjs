// Fills the repeating "Work history" and "Education" blocks of an application from the resume.
// Everything here is read from the resume text; nothing is invented. A value we cannot read stays blank for the applicant.
import {parseResume,resumeEntries} from './latex-resume.mjs';

const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const monthNumber=text=>{const i=MONTHS.indexOf(String(text||'').slice(0,3).toLowerCase());return i>=0?i+1:0;};

// "Mar 2021 - Present", "03/2021 – 06/2023", "2018 - 2022", "2018" -> {start:{y,m},end:{y,m}|null,current}
export function parseDateRange(text){
  const raw=String(text||'');
  const stamps=[...raw.matchAll(/(?:(\d{1,2})\/|([A-Za-z]{3,9})\.?\s+)?((?:19|20)\d{2})/g)].map(m=>({y:Number(m[3]),m:m[1]?Number(m[1]):monthNumber(m[2])}));
  const current=/\b(present|current|now|ongoing)\b/i.test(raw);
  if(!stamps.length)return null;
  return {start:stamps[0],end:current?null:(stamps[1]||stamps[0]),current};
}

const YEAR_ONLY=/^\D*(?:19|20)\d{2}\D*$/;
const DEGREE=/^(B\.?\s?S\.?c?|B\.?\s?A\.?|B\.?\s?Eng|M\.?\s?S\.?c?|M\.?\s?A\.?|M\.?\s?Eng|MBA|Ph\.?\s?D\.?|Associate[^,]*?|Bachelor[^,]*?|Master[^,]*?|Doctor[^,]*?)(?:\s+(?:in|of)\s+|\s+)(.+)$/i;
export function parseEducationLine(title,sub='',date=''){
  const parts=(sub?[title,...sub.split(' | ')]:String(title).split(/,\s+/)).map(x=>x.trim()).filter(Boolean);
  const range=parseDateRange([date,...parts.filter(x=>YEAR_ONLY.test(x))].join(' '));
  const body=parts.filter(x=>!YEAR_ONLY.test(x));
  const first=body[0]||'';const m=DEGREE.exec(first);
  const span=range&&range.start&&range.end&&(range.start.y!==range.end.y||range.start.m!==range.end.m);
  return {degree:m?m[1].trim():first,field:m?m[2].trim():'',school:body[1]||'',start:span?range.start:null,end:range?.end||null};
}

export function historyEntries(resumeText){
  const out={experience:[],education:[]};
  if(!resumeText)return out;
  for(const section of parseResume(resumeText).sections){
    const key=section.key.toUpperCase();
    if(/^(EXPERIENCE|WORK|EMPLOYMENT|PROFESSIONAL EXPERIENCE)/.test(key)){
      for(const e of resumeEntries(section.lines)){
        if(!e.title)continue;
        let title=e.title,company=e.sub;
        if(!company&&title.includes(', ')){const i=title.indexOf(', ');company=title.slice(i+2);title=title.slice(0,i);}
        const range=parseDateRange(e.date||'');
        out.experience.push({title:title.trim(),company:company.trim(),start:range?.start||null,end:range?.end||null,current:Boolean(range?.current),description:e.bullets.join('\n')});
      }
    }else if(/^EDUCATION/.test(key)){
      for(const e of resumeEntries(section.lines))if(e.title)out.education.push(parseEducationLine(e.title,e.sub,e.date));
    }
  }
  return out;
}

const pad=n=>String(n).padStart(2,'0');
// Formats {y,m} the way the field shows dates. Returns '' when the resume has no such date.
export function formatDateFor(q,stamp){
  if(!stamp)return '';
  const {y,m}=stamp;
  const hint=`${q.placeholder||''} ${q.label||''}`;
  // A year alone never becomes a month or day: that would state a date the resume does not give.
  if(q.type==='date')return m?`${y}-${pad(m)}-01`:'';
  if(q.type==='month')return m?`${y}-${pad(m)}`:'';
  if(/mm\s*\/\s*dd\s*\/\s*yyyy/i.test(hint))return m?`${pad(m)}/01/${y}`:'';
  if(/mm\s*\/\s*yyyy/i.test(hint))return m?`${pad(m)}/${y}`:'';
  if(/\byear\b|^\s*yyyy\s*$/i.test(hint)&&!/month/i.test(hint))return String(y);
  return m?`${pad(m)}/${y}`:String(y);
}
// Reads a displayed date back to "YYYY-MM" (or "YYYY") so a masked field can be compared with what was typed.
export function canonicalDate(value){
  const s=String(value||'').trim();
  let m=/^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);if(m)return `${m[1]}-${m[2]}`;
  m=/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/.exec(s);if(m)return `${m[2]}-${pad(Number(m[1]))}`;
  m=/^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);if(m&&monthNumber(m[1]))return `${m[2]}-${pad(monthNumber(m[1]))}`;
  m=/^(\d{4})$/.exec(s);if(m)return m[1];
  return '';
}
export const isDateQuestion=q=>q?.type==='date'||q?.type==='month'||/\b(start|end|from|to)\s+date\b|graduation date|date of graduation/i.test(q?.label||'');

const clean=label=>String(label||'').toLowerCase().replace(/\*/g,' ').replace(/\(.*?\)/g,' ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const EXP={title:/^(job title|title|position|position title|role|current title)$/,company:/^(company|company name|employer|employer name|organization|organisation)$/,description:/^(description|responsibilities|role description|job description|duties)$/};
const EDU={school:/^(school|school name|university|college|institution|school or university|university or college)$/,degree:/^(degree|degree type|level of education)$/,field:/^(field of study|major|discipline|area of study|course of study)$/};
const WHEN={start:/^(start date|from|start|date started|from date|start year)$/,end:/^(end date|to|end|date ended|to date|end year|graduation date|graduation year|date of graduation)$/};
const classify=label=>{
  const c=clean(label);
  for(const [field,re] of Object.entries(EXP))if(re.test(c))return {mode:'experience',field};
  for(const [field,re] of Object.entries(EDU))if(re.test(c))return {mode:'education',field};
  for(const [field,re] of Object.entries(WHEN))if(re.test(c))return {mode:null,field};
  return null;
};

// Returns {questionId: value} for repeating work and education blocks: the nth block on the page gets the nth resume entry.
// A new block starts when the section type changes or a field that already appeared in the current block comes up again.
export function historyAnswers(questions,history){
  const answers={};
  if(!history)return answers;
  let mode=null,block=new Set();const counts={experience:0,education:0};
  for(const q of questions){
    if(q.manual)continue;
    const kind=classify(q.label);if(!kind)continue;
    if(kind.mode){
      if(kind.mode!==mode||block.has(kind.field)){counts[kind.mode]++;block=new Set();mode=kind.mode;}
      block.add(kind.field);
    }
    if(!mode)continue;
    const entry=history[mode]?.[counts[mode]-1];if(!entry)continue;
    if(!(q.value===''||(Array.isArray(q.value)&&!q.value.length)))continue;
    let value='';
    if(kind.field==='start'||kind.field==='end'){
      if(kind.field==='end'&&entry.current)continue;
      value=formatDateFor(q,kind.field==='start'?entry.start:entry.end);
    }else value=kind.field==='description'?entry.description||'':entry[kind.field]||'';
    if(!value)continue;
    if(q.options?.length){
      const want=clean(value);
      const option=q.options.find(o=>clean(o.label)===want)||q.options.find(o=>want&&clean(o.label).length>2&&(clean(o.label).includes(want)||want.includes(clean(o.label))));
      if(!option)continue;value=option.value;
    }else if(['select','radio','checkbox','custom'].includes(q.type))continue;
    answers[q.id]=value;
  }
  return answers;
}
