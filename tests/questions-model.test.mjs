import test from 'node:test';import assert from 'node:assert/strict';
import {classifyQuestion,buildQuestionInbox,answerItems,isAnswered,normalizeQuestionKey} from '../public/questions-model.js';
const opt=(...labels)=>labels.map(label=>({label,value:label}));
const q=(id,label,extra={})=>({id,label,type:'text',required:true,value:'',options:[],manual:false,...extra});
const task=(id,jobId,questions,extra={})=>({id,jobId,parentTaskId:'p-'+id,type:'fill',status:'needs_you',checkpoint:{id:'cp-'+id,step:'Application',questions,unresolvedIds:questions.map(x=>x.id),...extra}});
const jobs=[{id:'a',company:'Acme',role:'Data Engineer'},{id:'b',company:'Beta',role:'Platform Engineer'}];

test('classification separates saveable facts from decisions the user must make',()=>{
  assert.equal(classifyQuestion(q('1','By checking this box, I consent to Acme processing my data')).lane,'decision');
  assert.deepEqual(['legal','decision'],[classifyQuestion(q('2','Are you subject to any non-compete agreement?')).kind,classifyQuestion(q('2','Are you subject to any non-compete agreement?')).lane],'agreement wording is legal, not consent');
  assert.equal(classifyQuestion(q('3','Do you have any Personal/Familial Relationships with current employees?')).lane,'decision');
  assert.equal(classifyQuestion(q('4','Candidate AI Usage Attestation:')).lane,'decision');
  const gender=classifyQuestion(q('5','What is your gender identity?'));assert.deepEqual([gender.lane,gender.kind,gender.saveTarget,gender.packKey],['default','eeo','answer pack','eeo_gender']);
  const military=classifyQuestion(q('6','What is your military status?'));assert.deepEqual([military.kind,military.saveTarget],['eeo','library'],'the engine reads only veteran wording from the Answer pack, so military status is saved as a learned answer');
  assert.equal(classifyQuestion(q('7','Will you require visa sponsorship?')).kind,'authorization');
  assert.equal(classifyQuestion(q('8','Why do you want to work here?',{type:'textarea'})).kind,'open');
  const office=classifyQuestion(q('9','What is your preferred office location?'));assert.deepEqual([office.lane,office.kind,office.saveTarget],['default','fact','library']);
});

test('the same factual question across applications is one card, but decisions stay per application',()=>{
  const office=(id)=>q(id,'What is your preferred office location?*',{type:'select',options:opt('New York','Menlo Park')});
  const consent=(id)=>q(id,'I consent to Acme collecting my data');
  const tasks=[task('t1','a',[office('o1'),consent('c1')]),task('t2','b',[office('o2'),consent('c2')])];
  const inbox=buildQuestionInbox(tasks,jobs);
  const facts=inbox.groups.filter(g=>g.meta.lane==='default'),decisions=inbox.groups.filter(g=>g.meta.lane==='decision');
  assert.equal(facts.length,1);assert.equal(facts[0].items.length,2);assert.deepEqual(facts[0].items.map(i=>i.company),['Acme','Beta']);
  assert.equal(decisions.length,2,'one decision card per application');decisions.forEach(d=>assert.equal(d.items.length,1));
  assert.equal(inbox.groups.at(-1).meta.lane,'decision','decisions sort after facts');
  assert.deepEqual(inbox.counts,{questions:3,applications:2,answersToSend:4});
});

test('same wording with different options is not merged, and labels normalize across asterisks and spacing',()=>{
  const a=q('1','Preferred  office *',{type:'select',options:opt('NY','SF')}),b=q('2','Preferred office',{type:'select',options:opt('London','Paris')});
  assert.equal(buildQuestionInbox([task('t1','a',[a]),task('t2','b',[b])],jobs).groups.length,2);
  assert.equal(normalizeQuestionKey('Preferred  office *'),normalizeQuestionKey('preferred office'));
});

test('only needs_you fill tasks with unresolved questions appear; consent boxes become Yes/No cards',()=>{
  const waiting=task('t1','a',[q('1','Notice period'),q('2','I agree to the terms',{manual:true})]);
  const verification=task('t2','b',[q('3','Code')],{pauseReason:'verification'});
  const running={...task('t3','b',[q('4','Other')]),status:'running'};
  const prepare={...task('t4','b',[q('5','Other')]),type:'prepare'};
  const inbox=buildQuestionInbox([waiting,verification,running,prepare],jobs);
  assert.deepEqual(inbox.groups.map(g=>g.label),['Notice period','I agree to the terms']);
  assert.equal(inbox.groups[1].meta.kind,'consent');assert.deepEqual(inbox.groups[1].options.map(o=>o.value),['Yes','No']);
  assert.equal(inbox.employerPage.length,0);
  const resolvedOnly=task('t5','a',[q('6','Resolved')]);resolvedOnly.checkpoint.unresolvedIds=[];
  assert.equal(buildQuestionInbox([resolvedOnly],jobs).groups.length,0);
  const errored=task('t6','a',[q('7','Phone')]);errored.checkpoint.unresolvedIds=[];errored.checkpoint.errors={7:'Enter a valid phone'};
  assert.equal(buildQuestionInbox([errored],jobs).groups[0].items[0].error,'Enter a valid phone');
});

test('answer items fan one answer out to every waiting application, and never offer to save decisions',()=>{
  const fact=(id)=>q(id,'Preferred office',{type:'select',options:opt('NY')}),consent=(id)=>q(id,'I consent to processing');
  const inbox=buildQuestionInbox([task('t1','a',[fact('f1'),consent('c1')]),task('t2','b',[fact('f2')])],jobs);
  const factGroup=inbox.groups.find(g=>g.meta.lane==='default'),decisionGroup=inbox.groups.find(g=>g.meta.lane==='decision');
  const items=answerItems(inbox.groups,{[factGroup.key]:'NY',[decisionGroup.key]:'Yes'},{});
  assert.equal(items.length,3);
  assert.deepEqual(items.filter(i=>i.questionId.startsWith('f')).map(i=>[i.taskId,i.save]),[['t1',true],['t2',true]]);
  assert.equal(items.find(i=>i.questionId==='c1').save,false);
  assert.equal(answerItems(inbox.groups,{[factGroup.key]:'NY'},{[factGroup.key]:false}).every(i=>i.save===false),true,'the user can turn remembering off');
  assert.deepEqual(answerItems(inbox.groups,{[factGroup.key]:'',x:'y'},{}),[],'blank answers are never sent');
  assert.equal(isAnswered([]),false);assert.equal(isAnswered(['a']),true);assert.equal(isAnswered('  '),false);
});
test('open-ended answers are not remembered unless the user opts in',()=>{
  const inbox=buildQuestionInbox([task('t1','a',[q('1','Why do you want to work here?',{type:'textarea'}),q('2','Notice period')])],jobs);
  const open=inbox.groups.find(g=>g.meta.kind==='open'),fact=inbox.groups.find(g=>g.meta.kind==='fact');
  const items=answerItems(inbox.groups,{[open.key]:'Because…',[fact.key]:'2 weeks'},{});
  assert.equal(items.find(i=>i.questionId==='1').save,false);assert.equal(items.find(i=>i.questionId==='2').save,true);
  assert.equal(answerItems(inbox.groups,{[open.key]:'Because…'},{[open.key]:true})[0].save,true);
});


test('application workspace scopes matching questions before grouping and submission', async () => {
  const { buildApplicationQuestionInbox } = await import('../public/questions-model.js');
  const tasks = [task('ta', 'a', [q('qa', 'Preferred location')]), task('tb', 'b', [q('qb', 'Preferred location')])];
  const scoped = buildApplicationQuestionInbox(tasks, jobs, 'a');
  assert.equal(scoped.groups.length, 1);
  assert.deepEqual(scoped.groups[0].items.map(i => i.taskId), ['ta']);
  const sent = answerItems(scoped.groups, { [scoped.groups[0].key]: 'Remote' });
  assert.deepEqual(sent.map(i => i.taskId), ['ta']);
  assert.equal(buildApplicationQuestionInbox(tasks, jobs, 'missing').groups.length, 0);
});
