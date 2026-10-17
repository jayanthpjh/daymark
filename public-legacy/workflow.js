export const profileFields = ['name','phone','linkedin','headline','skills','workHistory','education','projects','certifications','resumeEmail','location','github','website'];
export const questionCatalog = [
  {id:'authorization_us',label:'Are you currently authorized to work in the US?',help:'Answer for your current status in the United States.',options:['Yes','No']},
  {id:'sponsorship_now',label:'Do you need sponsorship now?',help:'Keep current and future sponsorship separate.',options:['Yes','No']},
  {id:'sponsorship_future',label:'Will you need sponsorship in the future?',help:'Choose your own answer; Daymark does not infer immigration status.',options:['Yes','No']},
  {id:'relocation',label:'Are you willing to relocate?',help:'Your reusable relocation preference.',options:['Yes','No']},
  {id:'travel',label:'Are you willing to travel for work?',help:'Review individual job requirements before applying.',options:['Yes','No']},
  {id:'arrangement',label:'Preferred work arrangements',help:'Choose all arrangements you would consider.',options:['Remote','Hybrid','On-site'],multiple:true},
  {id:'employment',label:'Preferred employment types',help:'Choose all types you would consider.',options:['Full-time','Part-time','Contract','Internship'],multiple:true},
  {id:'availability',label:'When could you start?',help:'Confirm this again if your availability changes.',options:['Immediately','2 weeks','1 month','Specific date']},
];

export const eeoQuestionCatalog = [
  { id: 'eeo_gender', label: 'Gender (for employer EEO forms)', help: 'Used only when an application asks. Decline is a valid choice.', options: ['Male', 'Female', 'Non-binary', 'Decline to self-identify'] },
  { id: 'eeo_hispanic', label: 'Hispanic or Latino (for employer EEO forms)', help: 'Used only when an application asks. Decline is a valid choice.', options: ['Yes', 'No', 'Decline to self-identify'] },
  { id: 'eeo_race', label: 'Race / ethnicity (for employer EEO forms)', help: 'Used only when an application asks.', options: ['Asian', 'Black or African American', 'Hispanic or Latino', 'White', 'Two or more races', 'Native American or Alaska Native', 'Native Hawaiian or Pacific Islander', 'Decline to self-identify'] },
  { id: 'eeo_veteran', label: 'Veteran status (for employer EEO forms)', help: 'Used only when an application asks.', options: ['I am not a protected veteran', 'I am a protected veteran', 'Decline to self-identify'] },
  { id: 'eeo_disability', label: 'Disability status (for employer EEO forms)', help: 'Used only when an application asks.', options: ['No, I do not have a disability', 'Yes, I have a disability', 'Decline to self-identify'] },
];

export function pdfTextLines(items) {
  let text = '', previousY;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5];
    if (text && previousY !== undefined && y !== undefined && Math.abs(y - previousY) > 3 && !text.endsWith('\n')) text += '\n';
    text += item.str + (item.hasEOL ? '\n' : ' ');
    previousY = y;
  }
  return text.trim();
}

export function parseResume(text) {
  const lines = text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const aliases = {skills:['skills','technical skills','core competencies','technologies'],workHistory:['experience','work experience','professional experience','employment history','professional history'],education:['education','academic background'],projects:['projects','personal projects','selected projects'],certifications:['certifications','certificates','licenses'],summary:['summary','professional summary','profile','objective']};
  const heading = line => Object.entries(aliases).find(([,names])=>names.includes(line.replace(/[:|]/g,'').trim().toLowerCase()))?.[0];
  const sections={}; let active;
  for (const line of lines) { const key=heading(line); if(key){active=key;sections[key] ||= [];}else if(active) sections[active].push(line); }
  const firstHeading=lines.findIndex(line=>heading(line));
  const header=lines.slice(0,firstHeading<0?Math.min(lines.length,10):firstHeading);
  const name=header.find(line=>line.length<80 && /^[\p{L}][\p{L} .'-]+$/u.test(line) && !/resume|curriculum|engineer|developer|analyst|designer|manager/i.test(line))||'';
  const phone=header.join('\n').match(/(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/)?.[0]||'';
  const linkedin=text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-z0-9_%/-]+/i)?.[0]||'';
  const headline=header.find(line=>line!==name && /\b(engineer|developer|analyst|designer|manager|scientist|specialist|consultant|architect)\b/i.test(line) && line.length<150)||'';
  const fields={name,phone,linkedin:linkedin?(/^https?:/i.test(linkedin)?linkedin:`https://${linkedin}`):'',headline,resumeEmail:text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||''};
  for(const key of ['skills','workHistory','education','projects','certifications']) fields[key]=(sections[key]||[]).join('\n');
  const roleSuggestions=[...new Set([headline,...(sections.workHistory||[]).filter(line=>/\b(engineer|developer|analyst|designer|manager|scientist|specialist|consultant|architect)\b/i.test(line)&&line.length<110).map(line=>line.split(/\s[|–—]\s/)[0])].filter(Boolean))].slice(0,5);
  return {fields,roleSuggestions,evidence:Object.fromEntries(Object.entries(fields).filter(([,value])=>value).map(([key,value])=>[key,value])),warnings:['name','workHistory','education','skills'].filter(key=>!fields[key]).map(key=>`Review missing ${key.replace(/([A-Z])/g,' $1').toLowerCase()}.`)};
}

export function publishedPayFromDescription(description='') {
  const number='(?:\\d{1,3}(?:,\\d{3})+|\\d{4,6})(?:\\.\\d{2})?';
  const pattern=new RegExp('(?:hiring salary range|salary for this position is a base|base (?:salary|pay)(?: range)?|salary range|annual (?:salary|pay))(?:[^\\n$]{0,60})\\$('+number+')\\s*(?:-|–|—|to)\\s*\\$?('+number+')','i');
  const match=String(description).match(pattern);
  if(!match)return '';
  const low=Number(match[1].replaceAll(',','')),high=Number(match[2].replaceAll(',',''));
  if(low<10000||high<low||high>1000000)return '';
  return `$${low.toLocaleString('en-US')}–$${high.toLocaleString('en-US')}`;
}

export function compensationForJob(job) {
  const stored=String(job.basePayRange||job.salary||'').trim();
  const pay=stored&&!/not listed|not provided|unknown/i.test(stored)?stored:publishedPayFromDescription(job.description);
  return {answer:pay && !/not listed|not provided|unknown/i.test(pay)?pay:'$110,000 USD annually',source:pay && !/not listed|not provided|unknown/i.test(pay)?'Company published base pay':'Your fallback',fallback:110000};
}

export function migrateAnswerPack(answers=[]) {
  const values={};
  for(const item of answers){
    const q=item.question||'', a=String(item.answer||'').trim();
    const id=/current work authorization/i.test(q)?'authorization_us':/willing.*relocat|relocation options/i.test(q)?'relocation':/willing.*travel/i.test(q)?'travel':null;
    if(id && /^(yes|no)$/i.test(a)) values[id]=a[0].toUpperCase()+a.slice(1).toLowerCase();
  }
  return {version:2,values,completed:false,compensation:{policy:'company_base_pay_or_fallback',currency:'USD',annualFallback:110000}};
}

export const resumeSections=[['headline','Summary'],['skills','Skills'],['workHistory','Experience'],['education','Education'],['projects','Projects'],['certifications','Certifications']];
export function masterResume(profile){
 return [profile.name,[profile.email||profile.resumeEmail,profile.phone,profile.location,profile.linkedin,profile.github,profile.website].filter(Boolean).join(' | '),...resumeSections.flatMap(([key,label])=>profile[key]?[`\n${label.toUpperCase()}`,profile[key]]:[])].filter(Boolean).join('\n');
}
const normalizedFact = value => String(value||'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
export function protectedResumeFacts(profile={}) {
 const facts=[profile.name,profile.email,profile.phone,profile.linkedin].filter(Boolean);
 // Degrees, schools and certifications are verified in background checks, so they are identity facts too.
 for(const key of ['education','certifications'])for(const line of String(profile[key]||'').split(/\r?\n/).map(item=>item.trim()))if(line.length>=4)facts.push(line);
 const lines=String(profile.workHistory||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const datePattern=/(?:\b(?:19|20)\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{4}\b)/i;
 // A bullet that mentions a date ("completed the September 2026 cutover") is accomplishment text, not an employment-date header.
 for(let index=0;index<lines.length;index++) if(!/^[-•*–]\s/.test(lines[index])&&datePattern.test(lines[index])) {
   facts.push(lines[index]);
   for(const previous of lines.slice(Math.max(0,index-2),index)) if(previous&&!/^[-•*]/.test(previous)&&!/^\s*(experience|work experience|professional experience)\s*:?$/i.test(previous)) facts.push(previous);
 }
 for(const match of String(profile.workHistory||'').matchAll(/\b(?:client|customer|account)\s*[:–—-]\s*([^\n|,;]+)/gi)) facts.push(match[1].trim());
 return [...new Set(facts.map(value=>String(value).trim()).filter(value=>value.length>=2))];
}
export function missingProtectedResumeFacts(text,profile={}) {
 const output=normalizedFact(text);
 return protectedResumeFacts(profile).filter(fact=>!output.includes(normalizedFact(fact)));
}
export function resumeTemplateHtml(text){
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const headings=resumeSections.map(([,label])=>label.toUpperCase());
 const output=[];let bullets=[];
 const flushBullets=()=>{if(bullets.length){output.push(`<ul>${bullets.map(value=>`<li>${escape(value)}</li>`).join('')}</ul>`);bullets=[];}};
 String(text).split('\n').forEach((line,index)=>{
  const value=line.trim();
  if(/^[-•*]\s+/.test(value)){bullets.push(value.replace(/^[-•*]\s+/,''));return;}
  flushBullets();
  if(index===0&&value)output.push(`<h1>${escape(value)}</h1>`);
  else if(headings.includes(value.toUpperCase()))output.push(`<h2>${escape(value)}</h2>`);
  else if(value)output.push(`<p>${escape(value)}</p>`);
 });
 flushBullets();return output.join('');
}

export function resumePreviewDocument(text){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{max-width:760px;margin:24px auto;padding:24px;font:11pt Arial,sans-serif;color:#000;line-height:1.25;overflow-wrap:anywhere}h1{font-size:19pt}h2{font-size:11pt;margin-top:14px}p{white-space:pre-wrap;margin:6px 0}@media print{body{margin:0;padding:0}}</style><title>Daymark master resume</title></head><body>${resumeTemplateHtml(text)}</body></html>`;}
