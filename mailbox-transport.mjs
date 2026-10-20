import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { extractMailText, extractVerificationCode } from './mail-body.mjs';
import { MailboxError } from './mailbox-service.mjs';
const hash = v => createHash('sha256').update(v).digest('hex');
const safeLink = value => {try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const LIMIT = 15*1024*1024;
export function createMailboxTransport({ client, readEnv, getPassword }) {
  async function session(fn) { const c=await client();try{await c.connect();return await fn(c);}finally{await c.logout().catch(()=>{});} }
  async function folders(c) { const all=await c.list();const selected=[all.find(f=>f.path==='INBOX')||{path:'INBOX'},...['\\Sent','\\Archive','\\Junk','\\Spam','\\Trash'].map(use=>all.find(f=>f.specialUse===use)).filter(Boolean)];return [...new Map(selected.filter(f=>f.path).map(f=>[f.path,f])).values()]; }
  async function updateMessage(message, patch) {
    if (!message?.providerPresent || !message.mailbox || !Number.isInteger(Number(message.uid)) || !message.uidValidity) return { status: 'daymark_only', reason: 'This message has no current Proton mailbox reference.' };
    return session(async c => {
      const all = await c.list();
      const source = all.find(f => f.path === message.mailbox);
      if (!source) return { status: 'daymark_only', reason: 'The message folder is unavailable in Proton Bridge.' };
      let moveTo = '';
      const special = use => all.find(f => f.specialUse === use || String(f.specialUse || '').split(/\s+/).includes(use));
      if (patch.archived === true) moveTo = special('\\Archive')?.path || '';
      else if (patch.spam === true) moveTo = special('\\Junk')?.path || special('\\Spam')?.path || '';
      else if (patch.trashed === true) moveTo = special('\\Trash')?.path || '';
      else if ((patch.archived === false && (source.specialUse === '\\Archive' || /archive/i.test(source.path))) || (patch.spam === false && (source.specialUse === '\\Junk' || source.specialUse === '\\Spam')) || (patch.trashed === false && source.specialUse === '\\Trash')) moveTo = 'INBOX';

      const hasMove = ['archived', 'spam', 'trashed'].some(k => k in patch);
      if (hasMove && !moveTo) return { status: 'daymark_only', reason: 'Proton Bridge has no matching folder for this action.' };
      const lock = await c.getMailboxLock(source.path);
      let moveResult;
      try {
        if (String(c.mailbox?.uidValidity) !== String(message.uidValidity)) throw new MailboxError('provider_message_changed', 'This message changed in Proton. Sync mail and try again.', 409);
        const uid = Number(message.uid);
        const flags = async (enabled, name) => {
          const method = enabled ? c.messageFlagsAdd : c.messageFlagsRemove;
          if (typeof method !== 'function' || await method.call(c, uid, [name], { uid: true }) === false) throw new MailboxError('provider_action_failed', 'Proton did not confirm the message update. The Daymark copy is unchanged.', 503);
        };
        if ('unread' in patch) await flags(!patch.unread, '\\Seen');
        if ('starred' in patch) await flags(patch.starred, '\\Flagged');
        if (moveTo && moveTo !== source.path) {
          if (typeof c.messageMove !== 'function') return { status: 'daymark_only', reason: 'This Proton Bridge connection cannot move messages.' };
          moveResult = await c.messageMove(uid, moveTo, { uid: true });
          if (!moveResult) throw new MailboxError('provider_action_failed', 'Proton did not confirm the folder move. The Daymark copy is unchanged.', 503);
        }
      } finally { lock.release(); }
      if (moveTo && moveTo !== source.path) {
        const movedUid = moveResult.uidMap?.get(Number(message.uid)) ?? Number(message.uid);
        const destinationLock = await c.getMailboxLock(moveTo, { readOnly: true });
        const uidValidity = String(c.mailbox?.uidValidity || '');
        destinationLock.release();
        return { status: 'synced', mailbox: moveTo, uid: movedUid, uidValidity };
      }
      return { status: 'synced', mailbox: message.mailbox, uid: Number(message.uid), uidValidity: String(message.uidValidity) };
    });
  }
  return {
    async identity(){const e=await readEnv();return e.APPLICATION_EMAIL||e.PROTON_BRIDGE_USER||'';},
    updateMessage,
    async receive(cursor,{older=false}={}) {
      const env=await readEnv();return session(async c=>{
        const messages=[];let attachmentBytes=0;const next={...cursor,folders:{...cursor.folders}};
        for(const folder of await folders(c)) {
          const mailbox=folder.path;
          const lock=await c.getMailboxLock(mailbox,{readOnly:true});
          try {
            const validity=String(c.mailbox.uidValidity);const old=cursor.folders?.[mailbox];const aligned=old?.validity===validity?old:null;
            const newest=Number(c.mailbox.uidNext)-1;
            const upper=older&&aligned?aligned.oldest-1:newest;
            const lower=older?1:aligned?aligned.lastUid+1:1;
            // Search only returns UIDs. Fetch metadata first so a giant message cannot exhaust memory.
            const uids=upper>=lower?await c.search({uid:`${lower}:${upper}`},{uid:true}):[];
            const chosen=(older||!aligned?uids.slice(-50):uids.slice(0,50)).filter(n=>n>=lower&&n<=upper);
            for(const uid of chosen) {
              const head=await c.fetchOne(uid,{size:true,envelope:true,flags:true,internalDate:true},{uid:true});if(!head)continue;
              const id=hash(`${env.PROTON_BRIDGE_USER}\0${mailbox}\0${validity}\0${uid}`);
              const messageId=head.envelope?.messageId||'';
              const base={id,providerMessageKey:messageId?hash(`${env.PROTON_BRIDGE_USER}\0${messageId}`):id,providerPresent:true,mailbox,uid,uidValidity:validity,direction:folder.specialUse==='\\Sent'?'outgoing':'incoming',archived:folder.specialUse==='\\Archive',spam:['\\Junk','\\Spam'].includes(folder.specialUse),trashed:folder.specialUse==='\\Trash',unread:!head.flags?.has('\\Seen'),starred:head.flags?.has('\\Flagged')||false,date:head.internalDate?.toISOString()||new Date().toISOString(),attachments:[]};
              if(head.size>LIMIT) {messages.push({...base,from:head.envelope?.from?.[0]?.address||'',senderAddress:head.envelope?.from?.[0]?.address||'',subject:head.envelope?.subject||'(No subject)',messageId:head.envelope?.messageId||'',text:'Message exceeds the 15 MB import limit. Open Proton to read it.',oversized:true});continue;}
              const raw=await c.fetchOne(uid,{source:true},{uid:true});if(!raw?.source)continue;
              const parsed=await simpleParser(raw.source,{skipHtmlToText:true,skipTextToHtml:true});
              const attachments=[];const attachmentData=[];let bytes=0;
              for(const [i,a] of (parsed.attachments||[]).entries()) {
                const aid=hash(`${id}\0${i}`);bytes+=a.size;const stored=bytes<=10*1024*1024&&i<20&&attachmentBytes+a.size<=20*1024*1024;if(stored)attachmentBytes+=a.size;
                attachments.push({id:aid,contentType:String(a.contentType||'').slice(0,100),filename:String(a.filename||'attachment').replace(/[\\/\r\n\x00-\x1f]/g,'_').slice(0,180),size:a.size,available:stored});
                if(stored)attachmentData.push({id:aid,messageId:id,filename:attachments.at(-1).filename,contentType:attachments.at(-1).contentType,base64:a.content.toString('base64')});
              }
              messages.push({...base,from:parsed.from?.text||'',senderAddress:parsed.from?.value?.[0]?.address||'',to:parsed.to?.text||'',recipients:(Array.isArray(parsed.to)?parsed.to:[parsed.to]).flatMap(v=>v?.value||[]).map(v=>v.address?.toLowerCase()).filter(Boolean),receivedAt:base.date,verificationCode:extractVerificationCode(extractMailText(parsed.text,parsed.html)),subject:String(parsed.subject||'(No subject)').slice(0,300),text:extractMailText(parsed.text,parsed.html),messageId:parsed.messageId||'',inReplyTo:parsed.inReplyTo||'',references:Array.isArray(parsed.references)?parsed.references:String(parsed.references||'').match(/<[^>]+>/g)||[],links:[...new Set([...String(parsed.text||'').matchAll(/https?:\/\/[^\s<>"']+/g),...String(parsed.html||'').matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map(m=>safeLink((m[1]||m[0]).replace(/&amp;/g,'&'))).filter(Boolean))].slice(0,30),attachments,attachmentData});
            }
            next.folders[mailbox]={validity,lastUid:older?aligned?.lastUid||0:chosen.at(-1)||aligned?.lastUid||newest,oldest:older?chosen[0]||aligned?.oldest||1:aligned?.oldest||chosen[0]||newest+1,hasOlder:older ? chosen.length === 50 && chosen[0]>1 : aligned ? aligned.hasOlder : uids.length>50};
          }finally{lock.release();}
        }
        return {messages,cursor:next};
      });
    },
    async send(message) {
      const e=await readEnv();const password=await getPassword(e.PROTON_BRIDGE_USER||'');if(!password)throw Object.assign(new Error('Bridge password missing.'),{code:'EAUTH'});
      const t=nodemailer.createTransport({host:e.PROTON_BRIDGE_HOST||'127.0.0.1',port:Number(e.PROTON_BRIDGE_SMTP_PORT||1025),secure:e.PROTON_BRIDGE_MODE==='ssl',ignoreTLS:e.PROTON_BRIDGE_MODE==='plain',requireTLS:!e.PROTON_BRIDGE_MODE||e.PROTON_BRIDGE_MODE==='starttls',auth:{user:e.PROTON_BRIDGE_USER,pass:password},tls:{rejectUnauthorized:false},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});
      try{return await t.sendMail(message);}finally{t.close();}
    },
    async findSent(messageId) {return session(async c=>{const sent=(await folders(c)).find(f=>f.specialUse==='\\Sent');if(!sent)throw new MailboxError('sent_unavailable','The Sent folder is unavailable. Check Proton before retrying.',503);const lock=await c.getMailboxLock(sent.path,{readOnly:true});try{return (await c.search({header:{'message-id':messageId}},{uid:true})).length>0;}finally{lock.release();}});},
  };
}
