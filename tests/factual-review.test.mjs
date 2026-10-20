import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewFactualDraft} from '../factual-review.mjs';
const draft={source:'Built a reporting tool.',resume:'Delivered a reporting tool.',changes:[{before:'Built a reporting tool.',after:'Delivered a reporting tool.'}]};
test('each changed claim needs exact source evidence and no unsupported verdict',async()=>{
 for(const result of [{supported:false,unsupported:['invented'],evidence:[]},{supported:true,unsupported:[],evidence:[]},{supported:true,unsupported:[],evidence:[{index:0,quote:'Managed 20 engineers'}]}]) await assert.rejects(reviewFactualDraft({...draft,llm:async()=>result}),/factual/);
 await reviewFactualDraft({...draft,llm:async()=>({supported:true,unsupported:[],evidence:[{index:0,quote:draft.source}]})});
});

test('rejects an exact source quote that is unrelated to the changed claim',async()=>{
 const source='Built a dashboard. Built a reporting tool.';
 await assert.rejects(reviewFactualDraft({source,changes:[{before:'Built a reporting tool.',after:'Managed 20 engineers.'}],llm:async()=>({supported:true,unsupported:[],evidence:[{index:0,quote:'Built a dashboard.'}]})}),/factual/);
});

test('checks each cover-letter sentence against its own source evidence',async()=>{
 const coverLetter='I built a reporting tool. I managed 20 engineers.';
 const source='Built a reporting tool.';
 await assert.rejects(reviewFactualDraft({source,changes:[],coverLetter,llm:async()=>({supported:true,unsupported:[],evidence:[{index:0,quote:source}]})}),/factual/);
});
