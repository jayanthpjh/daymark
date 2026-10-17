import test from 'node:test';import assert from 'node:assert/strict';
import {planReviewEdits} from '../review-edits.mjs';
const q=(id,label,extra={})=>({id,label,type:'text',required:true,value:'',options:[],manual:false,...extra});
const task=(extra={})=>({type:'fill',status:'needs_you',finalReviewReady:true,checkpoint:{id:'cp',step:'Application',questions:[q('a','Phone',{value:'555-0100'}),q('b','Work authorization',{type:'select',value:'Yes',options:[{label:'Yes',value:'Yes'},{label:'No',value:'No'}]}),q('c','Cover note',{manual:true,value:'x'})]},filledSteps:[{step:'Earlier step',questions:[q('z','Legal first name',{value:'Alex'})]}],...extra});

test('a changed answer on the open step is planned with its label',()=>{
  const plan=planReviewEdits(task(),{a:'555-0199'});
  assert.equal(plan.ok,true);assert.deepEqual(plan.answers,{a:'555-0199'});assert.deepEqual(plan.labels,['Phone']);
});
test('only applications sitting at their final review can be edited',()=>{
  for(const extra of [{status:'running'},{finalReviewReady:false},{type:'prepare'},{submitAttemptedAt:'now'}])assert.equal(planReviewEdits(task(extra),{a:'1'}).code,409,JSON.stringify(extra));
});
test('an edit to a field on a different step is refused with where it lives, never typed blind',()=>{
  const plan=planReviewEdits(task(),{z:'Alexander'});
  assert.equal(plan.code,409);assert.match(plan.error,/Legal first name \(Earlier step\)/);assert.match(plan.error,/Resolve this step/);
  assert.equal(planReviewEdits(task(),{unknown:'x'}).code,409);
});
test('an unchanged value, an empty request and a value outside the options are rejected',()=>{
  assert.equal(planReviewEdits(task(),{a:'555-0100'}).code,400);
  assert.equal(planReviewEdits(task(),{}).code,400);assert.equal(planReviewEdits(task(),null).code,400);
  const bad=planReviewEdits(task(),{b:'Maybe'});assert.equal(bad.code,400);assert.ok(bad.errors.b);
});
test('manual controls cannot be edited from the review',()=>{
  const plan=planReviewEdits(task(),{c:'y'});assert.equal(plan.code,400);assert.match(plan.errors.c,/Resolve this control/);
});
test('one bad edit rejects the whole request: nothing partial is queued',()=>{
  const plan=planReviewEdits(task(),{a:'555-0199',b:'Maybe'});assert.equal(plan.ok,false);assert.equal(plan.answers,undefined);
});
