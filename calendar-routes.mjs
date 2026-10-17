import { MailboxError } from './mailbox-service.mjs';
// Calendar API. Same-origin JSON only, like the mailbox. RSVP creates a mail draft; it never sends.
export function calendarRoutes({service,readBody,send}){
  const json=async(req,limit)=>{const value=await readBody(req,limit);if(!value||typeof value!=='object'||Array.isArray(value))throw new MailboxError('invalid_request','Enter a JSON object.',400);return value;};
  return async(req,res,url)=>{
    if(!url.pathname.startsWith('/api/calendar'))return false;
    try{
      if(req.method!=='GET'&&(req.headers['sec-fetch-site']==='cross-site'||!String(req.headers['content-type']||'').startsWith('application/json')))throw new MailboxError('invalid_request','Calendar actions require a same-origin JSON request.',400);
      if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)throw new MailboxError('origin_rejected','Use Daymark to change the calendar.',403);
      const parts=url.pathname.split('/').filter(Boolean);const [, ,kind,id,action]=parts;let result;
      if(req.method==='GET'&&parts.length===2)result=await service.list({from:url.searchParams.get('from')||'',to:url.searchParams.get('to')||''});
      else if(req.method==='GET'&&kind==='upcoming')result={events:await service.upcoming({hours:Math.min(168,Math.max(1,Number(url.searchParams.get('hours'))||24))})};
      else if(req.method==='POST'&&kind==='events'&&!id)result=await service.create(await json(req,5000));
      else if(req.method==='POST'&&kind==='events'&&id&&!action)result=await service.update(id,await json(req,5000));
      else if(req.method==='POST'&&kind==='events'&&id&&action==='delete'){await json(req,2000);result=await service.remove(id);}
      else if(req.method==='POST'&&kind==='events'&&id&&action==='rsvp')result=await service.rsvp(id,(await json(req,2000)).response);
      else throw new MailboxError('not_found','Calendar action not found.',404);
      send(res,200,result);
    }catch(e){
      if(e instanceof SyntaxError)e=new MailboxError('invalid_json','Enter valid JSON.',400);
      console.error(JSON.stringify({event:'calendar_request_failed',code:e.code||'storage_error',route:url.pathname.split('/').slice(0,4).join('/')}));
      send(res,e.status||500,{error:e instanceof MailboxError?e.message:'Calendar storage is unavailable.',code:e.code||'storage_error'});
    }
    return true;
  };
}
