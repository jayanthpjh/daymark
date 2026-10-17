import test from 'node:test';import assert from 'node:assert/strict';
import {reviewAnswers,reviewToken} from '../public/submission-review.js';
test('review renders actual saved answers, overlays current values and never renders field-name strings as answers',()=>{
 const fill={fieldsFilled:['resume'],filledSteps:[{step:'Application',answers:[{label:'Name',value:'Alex',source:'profile'},{label:'Skills',value:['SQL','Python']}]}],checkpoint:{step:'Application',questions:[{id:'q',label:'Name*',value:'Updated',type:'text'},{id:'p',label:'Password',value:'private'}]}};
 const rows=reviewAnswers(fill);assert.equal(rows.length,2);assert.equal(rows[0].value,'Updated');assert.equal(rows[0].editable,'q');assert.equal(reviewAnswers({fieldsFilled:['resume']}).length,0);
});
test('review token changes on answer or resume changes but not progress messages',async()=>{
 const fill={id:'f',filledSteps:[{answers:[{label:'Name',value:'Alex'}]}]};const prepare={id:'p',review:{resume:'original'}};
 const token=await reviewToken(fill,prepare);fill.message='updated';assert.equal(await reviewToken(fill,prepare),token);fill.filledSteps[0].answers[0].value='Edited';assert.notEqual(await reviewToken(fill,prepare),token);
});

test('submission uncertainty routes to in-app confirmation checks, never a browser handoff',async()=>{
 const {recoveryAction}=await import('../public/submission-review.js');
 assert.deepEqual(recoveryAction({submitAttemptedAt:'now'}),{label:'Check confirmation',section:'mail'});
 assert.deepEqual(recoveryAction({status:'needs_you'}),{label:'Review next step',section:'form'});
});
