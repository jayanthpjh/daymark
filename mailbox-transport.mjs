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
  async function folders(c) { const all=await c.list();const sent=all.find(f=>f.specialUse==='\\Sent');return ['INBOX',...(sent&&sent.path!=='INBOX'?[sent.path]:[])]; }
  return {
    async identity(){const e=await readEnv();return e.APPLICATION_EMAIL||e.PROTON_BRIDGE_USER||'';},
    async receive(cursor,{older=false}={}) {
      const env=await readEnv();return session(async c=>{
        const messages=[];let attachmentBytes=0;const next={...cursor,folders:{...cursor.folders}};
        for(const folder of await folders(c)) {
          const lock=await c.getMailboxLock(folder,{readOnly:true});
          try {
            const validity=String(c.mailbox.uidValidity);const old=cursor.folders?.[folder];const aligned=old?.validity===validity?old:null;
            const newest=Number(c.mailbox.uidNext)-1;
            const upper=older&&aligned?aligned.oldest-1:newest;
            const lower=older?1:aligned?aligned.lastUid+1:1;
            // Search only returns UIDs. Fetch metadata first so a giant message cannot exhaust memory.
            const uids=upper>=lower?await c.search({uid:`${lower}:${upper}`},{uid:true}):[];
            const chosen=(older||!aligned?uids.slice(-50):uids.slice(0,50)).filter(n=>n>=lower&&n<=upper);
            for(const uid of chosen) {
              const head=await c.fetchOne(uid,{size:true,envelope:true,flags:true,internalDate:true},{uid:true});if(!head)continue;
              const id=hash(`${env.PROTON_BRIDGE_USER}\0${folder}\0${validity}\0${uid}`);
              const base={id,mailbox:folder,uid,uidValidity:validity,direction:folder==='INBOX'?'incoming':'outgoing',unread:!head.flags?.has('\\Seen'),starred:head.flags?.has('\\Flagged')||false,date:head.internalDate?.toISOString()||new Date().toISOString(),attachments:[]};
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
            next.folders[folder]={validity,lastUid:older?aligned?.lastUid||0:chosen.at(-1)||aligned?.lastUid||newest,oldest:older?chosen[0]||aligned?.oldest||1:aligned?.oldest||chosen[0]||newest+1,hasOlder:older ? chosen.length === 50 && chosen[0]>1 : aligned ? aligned.hasOlder : uids.length>50};
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
    async findSent(messageId) {return session(async c=>{const names=await folders(c);if(names.length<2)throw new MailboxError('sent_unavailable','The Sent folder is unavailable. Check Proton before retrying.',503);const lock=await c.getMailboxLock(names[1],{readOnly:true});try{return (await c.search({header:{'message-id':messageId}},{uid:true})).length>0;}finally{lock.release();}});},
  };
}
