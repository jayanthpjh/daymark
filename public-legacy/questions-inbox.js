import {buildQuestionInbox,answerItems,isAnswered,defaultSave} from '/legacy/questions-model.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const DRAFTS='daymark-question-drafts',SAVES='daymark-question-saves';
export function loadQuestionDrafts(){try{return {drafts:JSON.parse(localStorage.getItem(DRAFTS)||'{}'),saves:JSON.parse(localStorage.getItem(SAVES)||'{}')};}catch{return {drafts:{},saves:{}};}}
function persist(state){try{localStorage.setItem(DRAFTS,JSON.stringify(state.questionDrafts||{}));localStorage.setItem(SAVES,JSON.stringify(state.questionSaves||{}));}catch{}}
const FILTERS=[['all','All'],['saves','Saved for next time'],['decisions','Your decisions'],['employer','On the employer page']];
const SAVE_COPY={'answer pack':'Save to my Answer pack so it fills automatically next time','library':'Remember this answer for matching questions'};

function control(group,value){
 const name=esc(group.key),label=esc(group.label);
 if(['radio','checkbox'].includes(group.type))return `<div class="qi-choices" role="${group.type==='radio'?'radiogroup':'group'}" aria-label="${label}">${group.options.map(o=>`<label class="qi-choice"><input type="${group.type}" name="${name}" data-qi-input="${name}" value="${esc(o.value)}" ${group.type==='checkbox'?(Array.isArray(value)&&value.includes(o.value)?'checked':''):(value===o.value?'checked':'')}><span>${esc(o.label)}</span></label>`).join('')}</div>`;
 if(['select','custom'].includes(group.type)&&group.options.length)return `<select aria-label="${label}" data-qi-input="${name}"><option value="">Choose an option</option>${group.options.map(o=>`<option value="${esc(o.value)}" ${value===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`;
 if(group.type==='textarea')return `<textarea rows="5" aria-label="${label}" data-qi-input="${name}" ${group.maxLength?`maxlength="${group.maxLength}"`:''}>${esc(value||'')}</textarea>`;
 return `<input aria-label="${label}" data-qi-input="${name}" type="${['number','date','email','tel','url'].includes(group.type)?group.type:'text'}" value="${esc(value||'')}" ${group.maxLength?`maxlength="${group.maxLength}"`:''}>`;
}
function waiting(items){
 const shown=items.slice(0,3).map(item=>`<span class="qi-company"><strong>${esc(item.company)}</strong> · ${esc(item.role)}</span>`).join('');
 return `<div class="qi-waiting" aria-label="Applications waiting on this answer">${shown}${items.length>3?`<span class="qi-more">+${items.length-3} more</span>`:''}</div>`;
}
function card(group,state){
 const value=state.questionDrafts?.[group.key],decision=group.meta.lane==='decision',save=state.questionSaves?.[group.key]??defaultSave(group);
 const error=group.items.map(item=>state.questionErrors?.[`${item.taskId}:${item.questionId}`]||item.error).find(Boolean);
 const target=group.meta.saveTarget;
 return `<article class="qi-card ${decision?'is-decision':''} ${isAnswered(value)?'is-answered':''}" data-qi-card="${esc(group.key)}">
  <header class="qi-card-top"><span class="qi-chip qi-${esc(group.meta.kind)}">${esc(group.meta.title)}</span>${group.required?'<span class="qi-required">Required</span>':'<span class="qi-optional">Optional</span>'}${group.items.length>1?`<span class="qi-count">${group.items.length} applications</span>`:''}</header>
  <h3 class="qi-label">${esc(group.label)}</h3>
  ${group.instructions?`<p class="qi-help">${esc(group.instructions)}</p>`:''}
  ${waiting(group.items)}
  <div class="qi-control">${control(group,value)}</div>
  ${error?`<p class="qi-error" role="alert">${esc(error)}</p>`:''}
  <footer class="qi-card-foot">${decision?`<p class="qi-callout"><strong>${esc(group.meta.title)}.</strong> ${esc(group.meta.note)}</p>`:`<label class="qi-save"><input type="checkbox" data-qi-save="${esc(group.key)}" ${save?'checked':''}><span>${esc(SAVE_COPY[target]||'Remember this answer')}</span></label><p class="qi-note">${esc(group.meta.note)}</p>`}${group.type==='textarea'&&!decision?`<button type="button" class="text-button" data-qi-draft="${esc(group.key)}">Draft with NVIDIA</button>`:''}</footer>
 </article>`;
}
export function questionsCount(state){return buildQuestionInbox(state.tasks||[],state.jobs||[]).counts.questions;}
export function renderQuestionsInbox(state){
 const inbox=buildQuestionInbox(state.tasks||[],state.jobs||[]);
 const filter=state.questionsFilter||'all';
 const facts=inbox.groups.filter(g=>g.meta.lane==='default'),decisions=inbox.groups.filter(g=>g.meta.lane==='decision');
 const answered=inbox.groups.filter(g=>isAnswered(state.questionDrafts?.[g.key])).length;
 if(!inbox.groups.length&&!inbox.employerPage.length)return `<section class="content-card qi-empty" data-questions-inbox><h2>Nothing is waiting on you.</h2><p>When an application hits a question Daymark can’t answer from your profile, it lands here. Answer a factual question once and Daymark fills it for every matching application.</p><button class="secondary-button" data-page="applications">See applications</button></section>`;
 const tabs=FILTERS.map(([id,name])=>{const count=id==='all'?inbox.groups.length+inbox.employerPage.length:id==='saves'?facts.length:id==='decisions'?decisions.length:inbox.employerPage.length;return `<button type="button" class="qi-tab" data-qi-filter="${id}" aria-pressed="${filter===id}">${name}<span>${count}</span></button>`;}).join('');
 const show=(id)=>filter==='all'||filter===id;
 const lane=(title,desc,groups)=>groups.length?`<section class="qi-lane"><div class="qi-lane-head"><h2>${title}</h2><p>${desc}</p></div><div class="qi-cards">${groups.map(g=>card(g,state)).join('')}</div></section>`:'';
 const employer=inbox.employerPage.length&&show('employer')?`<section class="qi-lane"><div class="qi-lane-head"><h2>On the employer page</h2><p>These controls can only be completed on the employer’s own form, such as consent boxes. Daymark opens the saved session where they are.</p></div><ul class="qi-employer">${inbox.employerPage.map(item=>`<li><div><strong>${esc(item.company)} · ${esc(item.role)}</strong><span>${esc(item.label)}</span></div><button type="button" class="secondary-button" data-qi-open="${esc(item.jobId)}">Open application</button></li>`).join('')}</ul></section>`:'';
 const total=inbox.groups.length;
 return `<div class="qi" data-questions-inbox>
  <section class="qi-summary" aria-label="Progress"><div><strong>${total}</strong> question${total===1?'':'s'} for <strong>${inbox.counts.applications}</strong> application${inbox.counts.applications===1?'':'s'}</div><div class="qi-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${answered}"><i style="width:${total?Math.round(answered/total*100):0}%"></i></div><span data-qi-answered>${answered} of ${total} answered</span></section>
  <nav class="qi-tabs" aria-label="Question types">${tabs}</nav>
  ${show('saves')?lane('Saved for next time','Facts and preferences. Answer once and Daymark remembers it for every matching question.',facts):''}
  ${show('decisions')?lane('Your decisions','Consents and legal questions are always yours. They apply only to the application shown and are never remembered.',decisions):''}
  ${employer}
  <div class="qi-bar" role="region" aria-label="Send answers"><p data-qi-bar-copy></p><button type="button" class="primary-button" data-qi-send disabled>Send answers</button></div>
 </div>`;
}
export function bindQuestionsInbox({getState,api,notify,afterSend,openApplication}){
 const groupsNow=()=>buildQuestionInbox(getState().tasks||[],getState().jobs||[]).groups;
 function updateBar(){
  const root=document.querySelector('[data-questions-inbox]');if(!root)return;const state=getState();const groups=groupsNow();
  const items=answerItems(groups,state.questionDrafts||{},state.questionSaves||{});const apps=new Set(items.map(i=>i.taskId)).size;
  const answered=groups.filter(g=>isAnswered(state.questionDrafts?.[g.key])).length;
  const copy=root.querySelector('[data-qi-bar-copy]'),send=root.querySelector('[data-qi-send]'),label=root.querySelector('[data-qi-answered]'),bar=root.querySelector('.qi-progress i');
  if(copy)copy.textContent=items.length?`${answered} answer${answered===1?'':'s'} ready · resumes ${apps} application${apps===1?'':'s'}`:'Answer a question to continue its applications.';
  if(send)send.disabled=!items.length;if(label)label.textContent=`${answered} of ${groups.length} answered`;if(bar)bar.style.width=`${groups.length?Math.round(answered/groups.length*100):0}%`;
  root.querySelectorAll('[data-qi-card]').forEach(el=>el.classList.toggle('is-answered',isAnswered(state.questionDrafts?.[el.dataset.qiCard])));
 }
 document.addEventListener('input',event=>{
  const root=event.target.closest?.('[data-questions-inbox]');if(!root)return;const state=getState();
  const save=event.target.closest('[data-qi-save]');
  if(save){state.questionSaves={...(state.questionSaves||{}),[save.dataset.qiSave]:save.checked};persist(state);return;}
  const input=event.target.closest('[data-qi-input]');if(!input)return;const key=input.dataset.qiInput;
  let value=input.value;
  if(input.type==='checkbox')value=[...root.querySelectorAll('[data-qi-input]')].filter(e=>e.dataset.qiInput===key&&e.checked).map(e=>e.value);
  if(input.type==='radio')value=[...root.querySelectorAll('[data-qi-input]')].find(e=>e.dataset.qiInput===key&&e.checked)?.value||'';
  state.questionDrafts={...(state.questionDrafts||{}),[key]:value};persist(state);updateBar();
 });
 document.addEventListener('click',async event=>{
  const root=event.target.closest?.('[data-questions-inbox]');if(!root)return;const state=getState();
  const filter=event.target.closest('[data-qi-filter]');
  if(filter){state.questionsFilter=filter.dataset.qiFilter;afterSend({rerender:true});return;}
  const open=event.target.closest('[data-qi-open]');if(open){openApplication(open.dataset.qiOpen);return;}
  const draft=event.target.closest('[data-qi-draft]');
  if(draft){const group=groupsNow().find(g=>g.key===draft.dataset.qiDraft);if(!group)return;
   if(!confirm('Send this question, your tailored resume, and the job description to NVIDIA to draft an answer?'))return;
   draft.disabled=true;try{const result=await api(`/api/tasks/${group.items[0].parentTaskId}/answer`,{question:group.label,sendToNvidia:true});state.questionDrafts={...(state.questionDrafts||{}),[group.key]:result.answer};persist(state);afterSend({rerender:true});notify('Draft ready. Edit it, then send.');}catch(error){notify(error.message,true);}finally{draft.disabled=false;}return;}
  const send=event.target.closest('[data-qi-send]');
  if(send){
   const groups=groupsNow();const items=answerItems(groups,state.questionDrafts||{},state.questionSaves||{});if(!items.length)return;
   send.disabled=true;state.questionErrors={};
   try{
    await api('/api/questions/answer',{items});
    for(const group of groups)if(isAnswered(state.questionDrafts?.[group.key]))delete state.questionDrafts[group.key];
    persist(state);notify(`Sent. Resuming ${new Set(items.map(i=>i.taskId)).size} application${new Set(items.map(i=>i.taskId)).size===1?'':'s'}.`);
    await afterSend({refresh:true});
   }catch(error){
    state.questionErrors=error.errors||{};notify(error.message,true);afterSend({rerender:true});
   }finally{send.disabled=false;}
  }
 });
 return updateBar;
}
