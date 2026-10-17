// Durable approval ledger for assistant actions that change something outside Daymark's own notes.
// The assistant proposes; only the applicant's click on a card runs it. Each card is bound to a fingerprint of what the
// applicant was shown (a review token, a draft revision, a checkpoint), so a card cannot approve something that changed.
// States: pending -> running -> done | failed, or pending -> declined | expired | conflict. Each state change is kept.
import {randomUUID} from 'node:crypto';

export class ApprovalError extends Error {constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const fail=(code,message,status)=>{throw new ApprovalError(code,message,status);};
export const APPROVAL_TTL_MS=10*60*1000;
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const clip=(value,max)=>String(value??'').slice(0,max);

export function createApprovalLedger({store,now=()=>Date.now(),ttlMs=APPROVAL_TTL_MS,log=()=>{}}={}){
  const tx=fn=>store?store.transaction(fn):fail('database_required','Assistant approvals need PostgreSQL. Set DAYMARK_DATABASE_URL and restart Daymark.',503);
  const iso=()=>new Date(now()).toISOString();
  const step=(record,status,note='')=>{record.status=status;record.updatedAt=iso();(record.history||=[]).push({status,at:record.updatedAt,...(note?{note:clip(note,200)}:{})});};
  const publicView=r=>({id:r.id,name:r.name,summary:r.summary,status:r.status,expiresAt:r.expiresAt,createdAt:r.createdAt,conversationId:r.conversationId||'',...(r.outcome?{outcome:r.outcome}:{})});

  return {
    // Records a pending card. `args` are the validated tool arguments; `binding` is the fingerprint of what the card describes.
    async propose({name,args,summary,binding='',conversationId='',turnId=''}){
      const record={id:randomUUID(),name,args,summary:clip(summary,300),binding:clip(binding,200),conversationId,turnId,actor:'agent',status:'pending',createdAt:iso(),updatedAt:iso(),expiresAt:now()+ttlMs,history:[{status:'pending',at:iso()}],date:iso()};
      await tx(r=>r.put('approvals',record));
      log(JSON.stringify({event:'agent_approval_proposed',id:record.id,action:name}));
      return publicView(record);
    },
    async pending(){
      return tx(async r=>(await r.list('approvals',{limit:200})).filter(a=>a.status==='pending'&&a.expiresAt>now()).map(publicView));
    },
    async get(id){if(!ID.test(String(id)))fail('invalid_id','Choose a valid approval.');return tx(async r=>{const a=await r.get('approvals',id);if(!a)fail('not_found','Approval not found.',404);return publicView(a);});},
    // The applicant accepts. `verify(record)` re-computes the binding; `run(record)` performs the action. Runs at most once.
    async accept(id,{verify,run}){
      if(!ID.test(String(id)))fail('invalid_id','Choose a valid approval.');
      const claimed=await tx(async r=>{
        const a=await r.get('approvals',id);if(!a)fail('not_found','Approval not found.',404);
        if(a.status!=='pending')return {record:a,ran:false};
        if(a.expiresAt<=now()){step(a,'expired');await r.put('approvals',a);return {record:a,ran:false};}
        step(a,'running');await r.put('approvals',a);return {record:a,ran:true};
      });
      if(!claimed.ran)return {status:claimed.record.status==='expired'?'expired':'not_pending',approval:publicView(claimed.record)};
      let outcome;
      try{
        const current=await verify(claimed.record);
        if(current!==claimed.record.binding)outcome={status:'conflict',message:'This changed after the card was shown. Nothing was done. Ask again to get a fresh card.'};
        else{const result=await run(claimed.record);outcome={status:'done',message:clip(result?.message||'Done.',300),...(result?.link?{link:clip(result.link,200)}:{})};}
      }catch(error){outcome={status:'failed',message:clip(error?.message||'The action failed.',300)};}
      return tx(async r=>{
        const a=await r.get('approvals',id);
        step(a,outcome.status,outcome.message);a.outcome=outcome;a.approvedBy='applicant';a.approvedAt=iso();
        await r.put('approvals',a);
        log(JSON.stringify({event:'agent_approval_finished',id,action:a.name,status:outcome.status}));
        return {status:outcome.status,message:outcome.message,approval:publicView(a)};
      });
    },
    async decline(id){
      if(!ID.test(String(id)))fail('invalid_id','Choose a valid approval.');
      return tx(async r=>{
        const a=await r.get('approvals',id);if(!a)fail('not_found','Approval not found.',404);
        if(a.status!=='pending')return {status:'not_pending',approval:publicView(a)};
        step(a,'declined');await r.put('approvals',a);return {status:'declined',approval:publicView(a)};
      });
    },
    // The audit trail: every approval with its state changes, newest first. Arguments are not repeated here.
    async activity({limit=50}={}){
      return tx(async r=>(await r.list('approvals',{limit:Math.min(200,limit)})).map(a=>({id:a.id,action:a.name,actor:a.actor,summary:a.summary,status:a.status,createdAt:a.createdAt,history:a.history})));
    },
  };
}
