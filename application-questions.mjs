import { canonicalDate, isDateQuestion } from './form-history.mjs';
import { createHash, randomUUID } from 'node:crypto';
export function questionSignature(questions){return createHash('sha256').update(JSON.stringify(questions.map(({id,label,type,required,options,maxLength,min,max,manual,instructions})=>({id,label,type,required,options,maxLength,min,max,manual,instructions})))).digest('hex');}
export function publicCheckpoint(checkpoint){if(!checkpoint)return null;const {url,questions=[],...rest}=checkpoint;return {...rest,questions:questions.map(({selector,members,...question})=>question)};}
// Consent and acknowledgement boxes that the page renders as custom controls. The applicant picks Yes or No in Daymark; that is all Daymark sends.
export const CONSENT_LABEL=/consent|privacy|agree|terms|acknowledg|sms|text message|marketing/i;
export const isConsentControl=q=>Boolean(q?.manual)&&CONSENT_LABEL.test(String(q.label||''));
export function validateAnswers(questions,answers){const errors={};const result={};for(const q of questions){if(!(q.id in answers))continue;let value=answers[q.id];if(isConsentControl(q)){if(value==='Yes'||value==='No')result[q.id]=value;else errors[q.id]='Choose Yes or No.';continue;}if(q.manual){errors[q.id]='Resolve this control in the application browser.';continue;}if(q.options?.length&&/country phone code/i.test(q.label)&&typeof value==='string'&&/^\+\d+$/.test(value)&&!q.options.some(o=>o.value===value)){const code=value;let matches=q.options.filter(o=>new RegExp(`\\(${code.replace(/[+]/g,'\\$&')}\\)`).test(o.label));const country=q.profileCountry||'';const isUS=/united states|\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|hampshire|jersey|mexico|york|carolina|dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|oh)\b/i.test(country);if(isUS){const us=matches.filter(o=>/united states/i.test(o.label));if(us.length)matches=us;}if(matches.length===1)value=matches[0].value;}const values=Array.isArray(value)?value:[value];if(q.type==='checkbox'&&!Array.isArray(value))errors[q.id]='Choose the applicable options.';else if(q.options?.length&&values.some(v=>!q.options.some(o=>o.value===v)))errors[q.id]='Choose an available option.';else if(q.required&&(value===''||(Array.isArray(value)&&!value.length)))errors[q.id]='This answer is required.';else if(!Array.isArray(value)&&typeof value!=='string')errors[q.id]='Enter a text answer.';else if(q.maxLength>0&&String(value).length>q.maxLength)errors[q.id]=`Use at most ${q.maxLength} characters.`;else if(q.type==='number'&&value!==''&&!Number.isFinite(Number(value)))errors[q.id]='Enter a number.';else if(q.type==='number'&&value!==''&&((q.min!==''&&q.min!==undefined&&Number(value)<Number(q.min))||(q.max!==''&&q.max!==undefined&&Number(value)>Number(q.max))))errors[q.id]='Enter a number within the employer’s allowed range.';else result[q.id]=value;}return {errors,answers:result};}
const OPTION_CSS='[role="option"],[data-automation-id="promptOption"],[data-automation-id="menuItem"]';
const ALL_VISIBLE=OPTION_CSS.split(',').map(part=>part+':visible').join(',');
const NEW_OPTION=OPTION_CSS.split(',').map(part=>part+':not([data-dm-seen]):visible').join(',');
const PLACEHOLDER_OPTION=/^(select one|select an option|choose( an)? option|please select|select\.\.\.|--+|none selected)$/i;
export async function applicationFormSurface(page){if(typeof page.frames!=='function')return page;let best=page,bestScore=-1;const frames=page.frames();for(let index=0;index<frames.length;index++){const frame=frames[index];const score=await frame.evaluate(()=>[...document.querySelectorAll('input:not([type="hidden"]),textarea,select,[role="combobox"],[role="radio"],[role="checkbox"],[data-automation-id="selectWidget"],input[type="file"]')].filter(element=>{if(element.closest('[hidden],[aria-hidden="true"],[inert]'))return false;if(typeof element.checkVisibility==='function')return element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});const style=getComputedStyle(element);return element.getClientRects().length&&style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0';}).length).catch(()=>0);const weighted=score*100+index;if(weighted>bestScore){best=frame;bestScore=weighted;}}return best===page?best:new Proxy(best,{get(target,key){if(key==='keyboard')return page.keyboard;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});}
const tagExistingOptions=page=>page.evaluate(css=>document.querySelectorAll(css).forEach(element=>element.setAttribute('data-dm-seen','1')),OPTION_CSS);
const untagOptions=page=>page.evaluate(()=>document.querySelectorAll('[data-dm-seen]').forEach(element=>element.removeAttribute('data-dm-seen'))).catch(()=>{});
async function closeDropdown(page,selector){
 await page.locator(selector).press('Escape').catch(()=>{});
 const keyboard=page.keyboard||page.page?.().keyboard;await keyboard?.press('Escape').catch(()=>{});
 await page.waitForTimeout(150);
}
export async function enumerateDropdownOptions(page,selector){
 await tagExistingOptions(page);
 try{
  await page.locator(selector).click({timeout:4000});
  await page.locator(ALL_VISIBLE).first().waitFor({state:'visible',timeout:4000});
  await page.waitForTimeout(400);
  const scope=(await page.locator(NEW_OPTION).count())?NEW_OPTION:ALL_VISIBLE;
  let labels=[],last=-1;
  for(let i=0;i<24;i++){labels=(await page.locator(scope).allTextContents()).map(text=>text.replace(/\s+/g,' ').trim()).filter(Boolean);const real=labels.filter(label=>!PLACEHOLDER_OPTION.test(label)).length;if(real&&real===last)break;last=real;await page.waitForTimeout(250);}
  await closeDropdown(page,selector);
  return [...new Set(labels.filter(label=>!PLACEHOLDER_OPTION.test(label)))].map(label=>({label,value:label}));
 }finally{await untagOptions(page);}
}
export async function selectDropdownOption(page,selector,value){
 await tagExistingOptions(page);
 try{
  await page.locator(selector).click();
  const escaped=String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const exactText=new RegExp('^\\s*'+escaped+'\\s*$','i');
  await page.locator(ALL_VISIBLE).first().waitFor({state:'visible',timeout:6000});
  await page.waitForTimeout(300);
  const fresh=page.locator(NEW_OPTION).filter({hasText:exactText});
  const candidates=(await fresh.count())?fresh:page.locator(ALL_VISIBLE).filter({hasText:exactText});
  await candidates.first().waitFor({state:'visible',timeout:6000});
  await candidates.first().click({timeout:5000});
 }finally{await untagOptions(page);}
}
async function selectWorkdayDropdownOption(page,selector,value){
 await tagExistingOptions(page);
 try{
  const exactText=new RegExp('^\\s*'+String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$','i');
  await page.locator(selector).click();
  for(let depth=0;depth<2;depth++){
   const fresh=page.locator(NEW_OPTION).filter({hasText:exactText});
   const all=page.locator(ALL_VISIBLE).filter({hasText:exactText});
   const options=(await fresh.count())?fresh:all;
   await options.first().waitFor({state:'visible',timeout:6000});
   await options.first().click({timeout:5000});
   await page.waitForTimeout(250);
   if(depth===1||!(await page.locator(NEW_OPTION).filter({hasText:exactText}).count()))break;
  }
 }finally{await untagOptions(page);}
}
export async function typeAndPickOption(page,selector,value){
 const input=page.locator(selector);await input.click();await input.fill('');await input.pressSequentially(String(value),{delay:40});
 await page.locator(ALL_VISIBLE).first().waitFor({state:'visible',timeout:8000});await page.waitForTimeout(500);
 const wanted=String(value).split(',')[0].trim().toLowerCase();const options=page.locator(ALL_VISIBLE);
 const count=await options.count();let target=null;
 for(let i=0;i<count;i++){const text=((await options.nth(i).textContent())||'').trim();if(!PLACEHOLDER_OPTION.test(text)&&text.toLowerCase().includes(wanted)){target=options.nth(i);break;}}
 if(!target)throw new Error('No matching suggestion.');
 await target.click({timeout:5000});
}
export const optionCacheKey=(page,step,q)=>{let host='';try{host=new URL(page.url()).hostname;}catch{}return `${host}|${step}|${q.key}`;};
export async function captureQuestions(page,step='Application information',{optionCache}={}){
 page=await applicationFormSurface(page);
 const raw=await page.evaluate(()=>{
  const visible=e=>!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const deepAll=(sel,root=document)=>{const out=[];for(const el of root.querySelectorAll('*')){if(el.matches(sel))out.push(el);if(el.shadowRoot)out.push(...deepAll(sel,el.shadowRoot));}return out;};
  const byId=(e,id)=>(e.getRootNode().getElementById?.(id))||document.getElementById(id);
  const FIELD='[data-automation-id^="formField"],fieldset';
  const CONTROL='input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]),textarea,select,[role="combobox"],[role="radio"],[role="checkbox"],[contenteditable="true"]';
  const isToggle=e=>e.tagName==='BUTTON'&&e.hasAttribute('aria-pressed');
  const isPopupButton=e=>e.tagName==='BUTTON'&&(e.getAttribute('aria-haspopup')==='listbox'||e.getAttribute('data-automation-id')==='selectWidget');
  const nearbyLabel=(e)=>{
   let node=e.parentElement;
   for(let depth=0;node&&node!==document.body&&depth<5;depth++,node=node.parentElement){
    const controls=[...node.querySelectorAll(CONTROL)].filter(visible);
    const sameGroup=controls.every(c=>c===e||(e.name&&c.name===e.name)||c.contains(e)||e.contains(c));
    if(!sameGroup)break;
    const candidates=[...node.querySelectorAll('label,legend,[class*="label" i],[class*="question" i] > :first-child,h1,h2,h3,h4,h5,h6,strong,p')];
    for(const candidate of candidates){
     if(candidate.contains(e)||candidate.querySelector?.(CONTROL))continue;
     if(!(candidate.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
     const text=clean(candidate.innerText);
     if(text&&text.length<=240)return {text,node:candidate};
    }
   }
   return null;
  };
  const find=e=>{
   const own=e.labels?.[0];if(own&&clean(own.innerText))return {text:clean(own.innerText),node:own};
   const aria=clean(e.getAttribute('aria-label'));if(aria)return {text:aria,node:null};
   const ids=(e.getAttribute('aria-labelledby')||'').split(' ').filter(Boolean);
   const byIds=ids.map(id=>byId(e,id)).filter(Boolean);
   const byText=clean(byIds.map(n=>n.innerText).join(' '));if(byText)return {text:byText,node:byIds[0]};
   const scoped=e.closest(FIELD)?.querySelector('legend,label');if(scoped&&clean(scoped.innerText))return {text:clean(scoped.innerText),node:scoped};
   if(isToggle(e)&&clean(e.innerText))return {text:clean(e.innerText),node:null};
   const near=nearbyLabel(e);if(near)return near;
   const rest=clean(e.placeholder||e.name||'');return {text:rest,node:null};
  };
  const requiredFrom=(e,text,node)=>e.required||e.getAttribute('aria-required')==='true'||/\*\s*$/.test(text)||/\((required|mandatory)\)\s*$/i.test(text)||Boolean(node&&((node.querySelector&&node.querySelector('abbr[title*="required" i],[class*="required" i],[class*="asterisk" i]'))||/required/i.test(node.className||'')));
  const errorFor=e=>{
   const scoped=e.closest(FIELD)?.querySelector('[role="alert"],[data-automation-id="errorMessage"]')?.innerText?.trim();if(scoped)return scoped;
   if(e.validationMessage)return e.validationMessage;
   const wrapper=e.parentElement?.closest('[class*="field" i],[class*="question" i],[class*="form-group" i]');
   const generic=wrapper&&[...wrapper.querySelectorAll('[class*="error" i]:not(input):not(select):not(textarea)')].find(n=>visible(n)&&clean(n.innerText)&&!n.contains(e));
   if(generic)return clean(generic.innerText);
   if(e.getAttribute('aria-invalid')==='true')return clean((e.getAttribute('aria-describedby')||'').split(' ').map(id=>byId(e,id)?.innerText||'').join(' '))||'This field is invalid.';
   return '';
  };
  const nodes=[...deepAll('input,textarea,select,[role="radio"],[role="checkbox"],[role="combobox"],[contenteditable="true"],button[aria-pressed],button[aria-haspopup="listbox"],button[data-automation-id="selectWidget"]')].filter(e=>visible(e)&&!e.disabled&&(!e.readOnly||e.getAttribute('role')==='combobox')&&!['hidden','password','file','submit','reset'].includes(e.type)&&(e.tagName!=='BUTTON'||isToggle(e)||isPopupButton(e))&&e.autocomplete!=='one-time-code'&&!(e.getAttribute('aria-hidden')==='true'&&e.tabIndex<0));
  const groups=new Map();const out=[];
  nodes.forEach((e,index)=>{e.setAttribute('data-daymark-field',String(index));const selector=`[data-daymark-field="${index}"]`;
   const found=find(e);let text=found.text;
   const requiredHere=requiredFrom(e,text,found.node);
   if(!text){if(requiredHere&&getComputedStyle(e).opacity!=='0'&&!e.closest('[aria-hidden="true"]')&&e.offsetWidth>=8&&e.offsetHeight>=8)text='Unlabeled required field';else return;}
   const manual=/consent|privacy|agree.*terms|signature|certif.*accurat/i.test(text);
   const workdaySearch=location.hostname.endsWith('myworkdayjobs.com')&&e.tagName==='INPUT'&&/^search$/i.test(e.placeholder||'');
   const editable=e.isContentEditable&&e.getAttribute('contenteditable')==='true';
   const kind=isToggle(e)?'radio':['radio','checkbox'].includes(e.getAttribute('role'))?e.getAttribute('role'):editable||e.tagName==='TEXTAREA'?'textarea':e.tagName==='SELECT'?'select':e.getAttribute('role')==='combobox'||e.tagName==='BUTTON'||workdaySearch?'custom':e.type||'text';
   const base={label:text,selector,type:kind,placeholder:e.getAttribute('placeholder')||'',required:requiredHere,maxLength:e.maxLength>0?e.maxLength:null,min:e.min||'',max:e.max||'',instructions:(e.getAttribute('aria-describedby')||'').split(' ').map(id=>byId(e,id)?.innerText||'').join(' ').trim(),error:errorFor(e),manual};
   if(['radio','checkbox'].includes(base.type)){
    const container=e.closest('fieldset,[role="group"],[role="radiogroup"],[data-automation-id^="formField"]')||(isToggle(e)?e.parentElement:null);
    const labelledBy=(container?.getAttribute('aria-labelledby')||'').split(' ').map(id=>clean(byId(e,id)?.innerText)).filter(Boolean).join(' ');
    const ownLabel=[...(container?.querySelectorAll('label')||[])].find(l=>!l.querySelector('input,button')&&clean(l.innerText));
    const previous=container?.previousElementSibling&&!container.previousElementSibling.querySelector?.(CONTROL)?clean(container.previousElementSibling.innerText):'';
    const groupLabel=clean(container?.querySelector('legend')?.innerText)||clean(container?.getAttribute('aria-label'))||labelledBy||clean(ownLabel?.innerText)||(previous&&previous.length<=240?previous:'')||(!container&&nearbyLabel(e)?.text)||(container?.querySelector('legend,label')?.innerText?.trim())||text;
    const key=base.type==='radio'?`radio:${e.name||groupLabel}`:`checkbox:${groupLabel}`;
    let group=groups.get(key);if(!group){group={...base,label:groupLabel,key,options:[],members:[],value:base.type==='radio'?'':[]};groups.set(key,group);out.push(group);}group.required||=base.required||container?.getAttribute('aria-required')==='true'||/\*\s*$/.test(groupLabel);group.manual||=manual;
    const value=e.value||e.getAttribute('data-value')||text;group.options.push({label:text,value});group.members.push({selector,value,toggle:isToggle(e)});const checked=isToggle(e)?e.getAttribute('aria-pressed')==='true':e.checked||e.getAttribute('aria-checked')==='true';if(checked){if(base.type==='radio')group.value=value;else group.value.push(value);}return;
   }
   base.key=e.name||`${base.type}:${text}`;
   base.value=editable?clean(e.innerText):base.type==='custom'&&e.tagName==='BUTTON'?e.innerText.trim():e.value||(base.type==='custom'?e.innerText.trim():'');if(base.type==='custom'&&e.tagName==='INPUT'){const shell=e.closest('[data-automation-id^="formField"]')||e.closest('[class*="control"]')||e.parentElement;const tags=[...(shell?.querySelectorAll('[class*="multi-value__label"]')||[])].map(t=>clean(t.innerText)).filter(Boolean);if(tags.length){base.value=tags;base.multi=true;}else{const shown=shell?.querySelector('[aria-selected="true"],[aria-checked="true"],[class*="single-value"],[class*="singleValue"]');base.value=shown?shown.innerText.trim().replace(/,?\s*press delete to clear value\.?$/i,''):'';}base.searchable=true;if(!base.value||base.value.length===0){const status=base.instructions.match(/\b1\s+item\s+selected\s*,\s*(.+)$/i);if(status)base.value=status[1].trim();}}if(typeof base.value==='string'&&/^select (one|an option)|^please select/i.test(base.value))base.value='';base.options=base.type==='select'?[...e.options].filter(o=>!o.disabled&&o.value!=='').map(o=>({label:o.text.trim(),value:o.value})):[];
   if(base.type==='custom')base.manual=true;
   out.push(base);
  });return out;
 });
 for(const q of raw.filter(q=>q.type==='custom'&&!/consent|privacy|terms/i.test(q.label))){
  if(q.value){q.options=[];q.manual=false;continue;}
  // Pure type-ahead location/school search fields have no options until typed into: skip slow click-enumeration when clearly a type-ahead field.
  if(q.searchable&&/^(location|city|current location|where are you located|school|university|college)\b/i.test(String(q.label||'').replace(/\*/g,'').trim())){q.options=[];q.manual=false;continue;}
  const cacheKey=optionCache?optionCacheKey(page,step,q):'';
  const cached=cacheKey?optionCache.get(cacheKey):null;
  if(cached?.length){q.options=cached.map(option=>({...option}));q.manual=false;continue;}
  try{q.options=await enumerateDropdownOptions(page,q.selector);q.manual=!q.options.length&&!q.searchable;if(cacheKey&&q.options.length)optionCache.set(cacheKey,q.options.map(option=>({...option})));}
  catch{q.options=[];q.manual=!q.searchable;await page.locator(q.selector).press('Escape').catch(()=>{});}
 }
 const occurrences=new Map();const questions=raw.map(q=>{const key=`${step}:${q.key}`;const n=occurrences.get(key)||0;occurrences.set(key,n+1);return {...q,id:createHash('sha256').update(`${key}:${n}`).digest('hex').slice(0,20)};});
 return {id:randomUUID(),step,url:page.url(),capturedAt:new Date().toISOString(),signature:questionSignature(questions),questions};
}
export function normalizeForCompare(q,value){
 const text=String(value??'').replace(/\s+/g,' ').trim();
 if(q.type==='tel'||/phone|mobile|telephone/i.test(q.label||'')){const d=text.replace(/\D/g,'');return d.length>10?d.slice(-10):d;}
 if(q.type==='number'||/salary|compensation|pay\b|postal|zip/i.test(q.label||'')){const d=text.replace(/[^0-9.]/g,'');return d||text.toLowerCase();}
 return text.toLowerCase();
}
export function sameAnswer(q,actual,expected){
 const list=value=>(Array.isArray(value)?value:[value]).map(item=>normalizeForCompare(q,item));
 const a=list(actual),b=list(expected);
 if(Array.isArray(actual)||Array.isArray(expected))return a.length===b.length&&[...a].sort().every((item,index)=>item===[...b].sort()[index]);
 if(a[0]===b[0])return true;
 if(isDateQuestion(q)&&a[0]&&b[0]){const x=canonicalDate(a[0]),y=canonicalDate(b[0]);if(x&&y)return x===y;}
 if(q.type==='custom'&&a[0]&&b[0]){const words=text=>text.split(/[\s,;()]+/).filter(Boolean);const shown=words(a[0]),chosen=new Set(words(b[0]));return shown.length>0&&shown.every(word=>chosen.has(word));}
 return false;
}
export async function applyQuestionAnswers(page,checkpoint,answers,{optionCache}={}){
 page=await applicationFormSurface(page);
 const live=await captureQuestions(page,checkpoint.step,{optionCache});if(live.signature!==checkpoint.signature)return {stale:true,checkpoint:live,errors:{}};
 const checked=validateAnswers(live.questions,answers);if(Object.keys(checked.errors).length)return {...checked,checkpoint:live};
 let active=live;const fieldErrors={};
 for(const initial of live.questions){if(!(initial.id in checked.answers))continue;const q=active.questions.find(q=>q.id===initial.id);if(!q)continue;
  if(JSON.stringify(q.options||[])!==JSON.stringify(initial.options||[])){fieldErrors[q.id]='Available options changed. Review this question again.';optionCache?.delete(optionCacheKey(page,checkpoint.step,q));continue;}
  const value=checked.answers[q.id];try{
   if(isConsentControl(q)){const box=page.locator(q.selector).first();const want=value==='Yes';if(await box.isChecked().catch(()=>false)!==want)await box.setChecked(want,{timeout:8000});}
   else if(q.type==='radio'){for(const member of q.members)if(member.value===value){if(member.toggle)await page.locator(member.selector).click();else await page.locator(member.selector).check();}}
   else if(q.type==='checkbox'){for(const member of q.members)await page.locator(member.selector).setChecked(value.includes(member.value));}
   else if(q.type==='select')await page.locator(q.selector).selectOption(value);
   else if(q.type==='custom'){const wanted=Array.isArray(value)?value:[value];const chosen=Array.isArray(q.value)?q.value:[q.value];for(const one of wanted){if(q.multi&&chosen.some(item=>normalizeForCompare(q,item)===normalizeForCompare(q,one)))continue;if(q.searchable&&!q.options?.length)await typeAndPickOption(page,q.selector,one);else if(/\.myworkdayjobs\.com$/i.test(new URL(page.url()).hostname))await selectWorkdayDropdownOption(page,q.selector,one);else await selectDropdownOption(page,q.selector,one);}}
   else await page.locator(q.selector).fill(value);
   if(['radio','checkbox','select','custom'].includes(q.type))active=await captureQuestions(page,checkpoint.step,{optionCache});
  }catch{fieldErrors[q.id]='This field changed or could not be filled. Review it or resolve this step in the browser.';optionCache?.delete(optionCacheKey(page,checkpoint.step,q));}
 }
 const after=await captureQuestions(page,checkpoint.step,{optionCache});const errors={...fieldErrors};for(const q of after.questions){if(!(q.id in checked.answers))continue;const value=checked.answers[q.id];const typed=q.searchable&&!q.options?.length&&String(q.value).toLowerCase().includes(String(value).split(',')[0].trim().toLowerCase());if(!typed&&!sameAnswer(q,q.value,value)){errors[q.id]='The application did not retain this answer.';optionCache?.delete(optionCacheKey(page,checkpoint.step,q));}else if(q.error)errors[q.id]=q.error;}
 return {checkpoint:after,errors,answers:checked.answers};
}
export async function resumeFileInput(surface){
 const all=surface.locator('input[type="file"]');
 const count=await all.count();
 if(count<=1)return all.first();
 const scores=await surface.evaluate(()=>[...document.querySelectorAll('input[type="file"]')].map(input=>{
  const near=input.closest('fieldset,[class*="field" i],[class*="upload" i],[class*="attach" i],[data-field],[data-qa]')||input.parentElement;
  const text=[input.id,input.name,input.getAttribute('aria-label'),input.getAttribute('data-field'),input.getAttribute('data-qa'),input.labels?.[0]?.innerText,(near?.innerText||'').slice(0,160)].join(' ');
  return /cover/i.test(text)?-1:/resume|r\u00e9sum\u00e9|\bcv\b|curriculum/i.test(text)?2:/transcript|portfolio|reference|certificate|writing sample|other/i.test(text)?-1:0;
 })).catch(()=>[]);
 let best=-1,bestScore=-2;scores.forEach((score,index)=>{if(score>bestScore){best=index;bestScore=score;}});
 return best>=0&&bestScore>=0?all.nth(best):all.first();
}
export async function applicationStep(inputPage) {
  const page = typeof inputPage.frames === 'function' ? inputPage : inputPage.page?.() || inputPage;
  const frames = typeof page.frames === 'function' ? page.frames() : [inputPage];
  const evidence = await Promise.all(frames.map(async (frame, frameIndex) => frame.evaluate(frameIndex => {
    const visible = element => {
      if (element.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
      if (typeof element.checkVisibility === 'function') return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      const style = getComputedStyle(element);
      return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const hasControls = [...document.querySelectorAll('input:not([type=hidden]),textarea,select,[role=combobox],button')].some(visible);
    const recognized = /^(My Information|My Experience|Application Questions.*|Voluntary Disclosures|Self Identify|Review|Autofill with Resume)$/i;
    const headings = [...document.querySelectorAll('body *')].filter(element => visible(element) && recognized.test((element.innerText || element.textContent || '').trim())).map((element, index) => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { text: (element.innerText || element.textContent || '').trim(), size: parseFloat(style.fontSize) || 0, height: rect.height, top: rect.top, native: /^H[1-4]$/.test(element.tagName), index, frameIndex };
    });
    return { text, headings, hasControls };
  }, frameIndex).catch(() => ({ text: '', headings: [], hasControls: false }))));
  const visibleText = evidence.map(frame => frame.text).filter(Boolean).join(' ');
  const sourceQuestion = /How Did You Hear About Us\s*\??\s*\*?/i;
  const priorEmploymentQuestion = /Have you (ever )?(previously )?(worked|been employed) (for|by|at)\b/i;
  if (sourceQuestion.test(visibleText) && priorEmploymentQuestion.test(visibleText)) return 'My Information';
  const formHeadings = evidence.filter(frame => frame.hasControls).flatMap(frame => frame.headings);
  const ranked = (formHeadings.length ? formHeadings : evidence.flatMap(frame => frame.headings)).sort((a, b) => b.size - a.size || b.height - a.height || b.top - a.top || Number(b.native) - Number(a.native) || a.frameIndex - b.frameIndex || a.index - b.index);
  return ranked[0]?.text || 'Application information';
}
export async function isWorkdayResumeUploadStep(page){const form=await applicationFormSurface(page);return await applicationStep(form)==='Autofill with Resume'&&await form.getByRole('button',{name:/^Continue$/i}).isVisible().catch(()=>false);}
export async function hasNextStep(page){page=await applicationFormSurface(page);const next=page.getByRole('button',{name:/^(Save and Continue|Save & Continue|Next|Continue)$/i});return await next.count()===1&&await next.isVisible().catch(()=>false)&&await next.isEnabled().catch(()=>false);}
export async function nextApplicationStep(page){page=await applicationFormSurface(page);const next=page.getByRole('button',{name:/^(Save and Continue|Save & Continue|Next|Continue)$/i});if(await next.count()!==1||!await next.isVisible()||!await next.isEnabled())return false;await next.click();return true;}
export async function waitForApplicationStepChange(page,previous,{timeoutMs=10000,pollMs=250}={}){
 const started=Date.now();
 while(Date.now()-started<timeoutMs){
  await page.waitForTimeout(pollMs);
  if(await applicationStep(page)!==previous)return true;
 }
 return false;
}
export function knownQuestionAnswers(questions,profile,pack={},applicationEmail=''){
 const result={},name=String(profile.name||'').trim().split(/\s+/),location=String(profile.location||'').split(',').map(x=>x.trim());
 for(const q of questions){if(q.manual||q.value!==''&&(Array.isArray(q.value)?q.value.length:true))continue;const label=q.label.replace(/\*/g,'').trim().toLowerCase();let value;
  if(label==='first name'&&name.length===2)value=name[0];else if(label==='last name'&&name.length===2)value=name[1];else if(['full name','name'].includes(label))value=profile.name;else if(['email','email address'].includes(label))value=applicationEmail;else if(['phone','phone number','mobile phone number'].includes(label))value=profile.phone;else if(label==='city'&&location.length>1)value=location[0];else if(label==='state'&&location.length>1)value=location[1];else if(label==='country'&&/united states/i.test(profile.location||''))value='United States of America';
  else if(/^are you (currently )?authorized to work in (the )?(us|united states)\??$/i.test(label))value=pack.values?.authorization_us;
  else if(/^are you willing to relocate\??$/i.test(label))value=pack.values?.relocation;
  else if(/^are you willing to travel\??$/i.test(label))value=pack.values?.travel;
  if(!value)continue;
  if(q.options?.length){const option=q.options.find(o=>o.label.toLowerCase()===String(value).toLowerCase()||(label==='country'&&/^united states(?: of america)?$/i.test(o.label)));if(option)result[q.id]=q.type==='checkbox'?[option.value]:option.value;}
  else if(!['checkbox','radio','custom','select'].includes(q.type))result[q.id]=String(value);
 }
 return result;
}
