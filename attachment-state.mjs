import path from 'node:path';
export async function inspectResumeAttachment(page,file){
 const expected=path.basename(file||'');if(!expected)return {status:'missing',reason:'Prepared resume missing.'};
 const inspect=async frame=>frame.evaluate(expected=>{
  const inputs=[...document.querySelectorAll('input[type="file"]')];
  for(const input of inputs){if([...input.files||[]].some(file=>file.name===expected)){
    const group=input.closest('fieldset,[role="group"],[data-automation-id^="formField"],[data-automation-id*="upload" i]')||(input.parentElement?.tagName==='FORM'?input:input.parentElement);
    const describedBy=(input.getAttribute('aria-describedby')||'').split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean);
    const error=input.getAttribute('aria-invalid')==='true'||group?.matches('[aria-invalid="true"],[role="alert"]')||group?.querySelector('[aria-invalid="true"],[role="alert"]')||describedBy.some(element=>element.matches('[aria-invalid="true"],[role="alert"]'));
    if(error)return {status:'rejected'};
    if(group?.matches('[aria-busy="true"]')||group?.querySelector('[aria-busy="true"]'))return {status:'pending'};
    return {status:'accepted',method:'live_file_field'};
  }}
  for(const element of document.querySelectorAll('[data-automation-id],li,[role=group],div')){
    const text=element.innerText||'';
    const controls=[...element.querySelectorAll('button,[role=button]')].map(button=>button.getAttribute('aria-label')||button.title||button.innerText).join(' ');
    if(text.length<2000&&text.includes(expected)&&/successfully uploaded|uploaded|remove (?:file|resume)|delete (?:file|resume)/i.test(text+' '+controls)){
      if(element.matches('[aria-busy=true]')||element.querySelector('[aria-busy=true]'))return {status:'pending'};
      if(element.matches('[aria-invalid=true]')||element.querySelector('[aria-invalid=true],[role=alert]'))return {status:'rejected'};
      return {status:'accepted',method:'employer_upload_receipt'};
    }
  }
  return {status:'missing'};
 },expected).catch(()=>({status:'missing'}));
 const frames=typeof page.frames==='function'?page.frames():[page];
 const states=await Promise.all(frames.map(inspect));
 const state=states.find(item=>item.status==='accepted')||states.find(item=>item.status==='pending')||states.find(item=>item.status==='rejected')||states[0]||{status:'missing'};
 return {...state,fileName:expected,verifiedAt:new Date().toISOString()};
}
