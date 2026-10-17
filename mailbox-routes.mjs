import { MailboxError } from './mailbox-service.mjs';
export function mailboxRoutes({service,readBody,send}) {
  const json = async (req,limit) => {const value=await readBody(req,limit);if(!value||typeof value!=='object'||Array.isArray(value))throw new MailboxError('invalid_request','Enter a JSON object.',400);return value;};
  return async (req,res,url)=>{
    if(!url.pathname.startsWith('/api/mailbox'))return false;
    try {
      if(req.method!=='GET' && (req.headers['sec-fetch-site']==='cross-site' || !String(req.headers['content-type']||'').startsWith('application/json')))throw new MailboxError('invalid_request','Mailbox actions require a same-origin JSON request.',403);
      // Mail is private. Same-origin mutations; the existing local host/access boundary still applies.
      if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)throw new MailboxError('origin_rejected','Use Daymark to perform mailbox actions.',403);
      let result;const parts=url.pathname.split('/').filter(Boolean);const [, ,kind,id,action]=parts;
      if(req.method==='GET'&&parts.length===2)result=await service.list(Object.fromEntries(url.searchParams));
      else if(req.method==='POST'&&kind==='sync')result=await service.sync(await json(req,2000));
      else if(req.method==='GET'&&kind==='threads'&&id)result=await service.thread(id);
      else if(req.method==='POST'&&kind==='messages'&&id)result=await service.updateMessage(id,await json(req,3000));
      else if(req.method==='GET'&&kind==='drafts'&&id)result=await service.draft(id);
      else if(req.method==='POST'&&kind==='drafts'&&!action)result=await service.saveDraft(id||null,await json(req,15000000));
      else if(req.method==='POST'&&kind==='drafts'&&action==='review')result=await service.review(id,(await json(req,2000)).revision);
      else if(req.method==='POST'&&kind==='drafts'&&action==='discard')result=await service.discard(id,(await json(req,2000)).revision);
      else if(req.method==='POST'&&kind==='attempts'&&action==='send'){await json(req,2000);result=await service.send(id);}
      else if(req.method==='POST'&&kind==='attempts'&&action==='reconcile'){await json(req,2000);result=await service.reconcile(id);}
      else if(req.method==='POST'&&kind==='attempts'&&action==='resolve-not-sent'){const b=await json(req,2000);result=await service.resolveNotSent(id,b.confirmed);}
      else if(req.method==='POST'&&kind==='assist') {const b=await json(req,2000);result=await service.assist(b.threadId,b.mode);}
      else if(req.method==='GET'&&kind==='attachments'&&id){const a=await service.attachment(id);res.writeHead(200,{'content-type':'application/octet-stream','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,'x-content-type-options':'nosniff','cache-control':'no-store','content-security-policy':"sandbox; default-src 'none'"});res.end(Buffer.from(a.base64,'base64'));return true;}
      else throw new MailboxError('not_found','Mailbox action not found.',404);
      send(res,200,result);
    }catch(e){if(e instanceof SyntaxError)e=new MailboxError('invalid_json','Enter valid JSON.',400);console.error(JSON.stringify({event:'mailbox_request_failed',code:e.code||'storage_error',route:url.pathname.split('/').slice(0,4).join('/')}));send(res,e instanceof MailboxError?e.status:503,{error:e instanceof MailboxError?e.message:'Mailbox is temporarily unavailable. Saved messages and drafts have not been discarded.',code:e.code||'storage_error'});}
    return true;
  };
}
