export const mailCategories=['Verification','Password reset','Assessment','Screening','Interview','Application confirmation','Application update','Offer','Rejection','Other'];
export function classifyMail({subject='',text=''}) {
 const content=`${subject}\n${text}`;
 const sentences=content.split(/\n|(?<=[.!?])\s+/).filter(s=>!/(?:\bif\b|\bmay\b|\bmight\b|\bcould\b|\bpotential\b|\bpossible\b|\bfuture\b|next steps? may|should you advance|if selected)/i.test(s));
 const present=sentences.join('\n'),labels=[];
 const rules={
 'Verification':/verif(?:y|ication).{0,45}(?:email|account|identity|code)|(?:email|account).{0,25}verif(?:y|ication)|one[- ]time (?:password|code)|authentication code|security code|confirm your email/i,
 'Password reset':/reset (?:your |the )?password|password reset|password recovery/i,
 'Assessment':/(?:complete|take|start|invited to|invitation to|assessment link|assessment deadline).{0,65}(?:assessment|coding challenge|technical test)|(?:assessment|coding challenge|technical test).{0,50}(?:invitation|due|deadline|complete|link|ready)/i,
 'Screening':/(?:schedule|invite|invitation|book|complete|arrange).{0,65}(?:screening|recruiter call|phone screen)|(?:screening|phone screen|recruiter call).{0,45}(?:scheduled|invitation|confirmed|availability)/i,
 'Interview':/(?:schedule|invite|invitation|book|confirm|availability|arrange).{0,65}interview|interview.{0,45}(?:invitation|scheduled|confirmed|availability|details|reschedule)/i,
 'Application confirmation':/application (?:has been |was |is )?(?:received|submitted)|received your application|thank you for applying|thanks for applying/i,
 'Application update':/application (?:status|update)|update (?:on|regarding) your application|application.{0,35}(?:under review|being reviewed|moved forward)/i,
 'Offer':/(?:offer of employment|job offer|employment offer|offer letter|pleased to offer you|extend (?:you )?(?:an |a )?offer)/i,
 'Rejection':/not (?:be )?(?:moving|proceeding) forward|will not be proceeding|unable to (?:offer|proceed)|not been selected|regret to inform|chosen (?:another|other) candidate|application (?:was |has been )?(?:unsuccessful|rejected)/i
 };
 for(const [label,rule] of Object.entries(rules))if(rule.test(present))labels.push(label);
 return labels.length?labels:['Other'];
}
export function filterMail(messages,search='',category=''){
 const query=search.trim().toLowerCase();return messages.filter(m=>(!category||m.categories?.includes(category))&&(!query||[m.senderName,m.senderAddress,m.from,m.subject,m.text].join(' ').toLowerCase().includes(query)));
}
export function safeMailLink(value){try{const url=new URL(value);return ['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''}catch{return ''}}
