import {randomUUID} from 'node:crypto';
export class AgentHistoryError extends Error {constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const fail=(code,message,status)=>{throw new AgentHistoryError(code,message,status);};
const validateId=id=>{if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))fail('invalid_id','Choose a valid conversation or request.');};
const summary=({turns,...c})=>({...c,turnCount:turns?.length||c.turnCount||0});
const expire=(c,time)=>{for(const t of c.turns)if(t.status==='running'&&t.expiresAt<=time){t.status='interrupted';t.reply='This request was interrupted. Your message is saved. Send it again when you are ready.';}};
const response=(c,t)=>({conversation:c,status:t.status,...(t.reply?{reply:t.reply}:{}),ran:t.ran||[],refused:t.refused||[],waiting:t.waiting||[]});

// Saved transcript is not an execution queue. Reading/restoring history never executes tools.
// claim in DB -> model/read tools outside DB -> persist result; duplicate request IDs only read the same turn.
export function createAgentHistory({store,agent,contextFor=async()=>({}),now=()=>Date.now(),log=console.info}={}){
  const tx=fn=>{if(!store)fail('database_required','Saved assistant conversations need PostgreSQL. Configure DAYMARK_DATABASE_URL and restart Daymark.',503);return store.transaction(fn);};
  async function getIn(r,id){const c=await r.get('conversations',id);if(!c)fail('not_found','Conversation not found.',404);expire(c,now());return c;}
  return {
    async list(){return tx(async r=>(await r.list('conversations',{limit:50,metadata:true})).map(summary));},
    async create(){return tx(async r=>{const c={id:randomUUID(),title:'New conversation',createdAt:new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString(),turns:[],turnCount:0};await r.put('conversations',c);return c;});},
    async get(id){validateId(id);return tx(async r=>{const c=await getIn(r,id);await r.put('conversations',c);return c;});},
    async message({conversationId,requestId,message,jobId}={}){
      validateId(conversationId);validateId(requestId);
      if(typeof message!=='string'||!message.trim()||message.length>2000)fail('invalid_message','Enter a message of 1–2,000 characters.');
      if(jobId!==undefined&&jobId!==null&&(typeof jobId!=='string'||jobId.length>200))fail('invalid_context','Choose a valid application.');
      const text=message.trim();
      // Authoritative context is resolved fresh. The client cannot submit page text or grant authority.
      const context=await contextFor(jobId);
      const claim=await tx(async r=>{
        const c=await getIn(r,conversationId);const existing=c.turns.find(t=>t.id===requestId);
        if(existing){if(existing.message!==text||existing.context?.jobId!==(context.jobId))fail('request_conflict','This request ID belongs to a different message or application.',409);return {c,t:existing,claimed:false};}
        if(c.turns.some(t=>t.status==='running'))fail('conversation_busy','A reply is already running in this conversation. Wait or use another conversation.',409);
        if(c.turns.length>=100)fail('conversation_full','This conversation has reached 100 messages. Start a new chat; your history remains saved.',409);
        const t={id:requestId,message:text,context,status:'running',createdAt:new Date(now()).toISOString(),expiresAt:now()+300000};
        c.turns.push(t);c.turnCount=c.turns.length;c.title=c.title==='New conversation'?text.slice(0,60):c.title;c.updatedAt=t.createdAt;
        await r.put('conversations',c);return {c,t,claimed:true};
      });
      if(!claim.claimed)return response(claim.c,claim.t);
      log(JSON.stringify({event:'assistant_turn_started',conversationId,requestId}));
      let result;
      try{
        const history=claim.c.turns.filter(t=>t.status==='complete').slice(-8).map(t=>({message:t.message,reply:t.reply}));
        result=await agent.message({message:text,context,history,conversationId,turnId:requestId});
        if(!result||typeof result.reply!=='string')throw new Error('invalid_model_response');
      }catch{
        result={reply:'The assistant could not respond. Your message is saved. Manual application controls are still available.',failed:true,ran:[],refused:[]};
      }
      return tx(async r=>{
        const c=await getIn(r,conversationId);const t=c.turns.find(t=>t.id===requestId);
        if(t.status==='running')Object.assign(t,{status:result.failed?'failed':'complete',reply:result.reply.slice(0,1500),ran:result.ran||[],refused:result.refused||[],waiting:(result.waiting||[]).slice(0,4),completedAt:new Date(now()).toISOString()});
        c.updatedAt=new Date(now()).toISOString();await r.put('conversations',c);
        log(JSON.stringify({event:'assistant_turn_finished',conversationId,requestId,status:t.status,actionCount:t.ran?.length||0}));return response(c,t);
      });
    },
  };
}
