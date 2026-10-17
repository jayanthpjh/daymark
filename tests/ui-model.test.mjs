import test from 'node:test';
import assert from 'node:assert/strict';
import {profileIdentity,setupReadiness,filterJobs,defaultJobFilters,jobStatus} from '../public/ui-model.js';
const complete={profile:{name:'Jane Doe',roleSearch:'Engineer',resumeText:'Resume'},onboarding:{profileConfirmed:true},answerPack:{completed:true}};
const configured={apify:true,nvidia:true,email:true,proton:true,ats:true};
test('setup requires every credential and profile requirement independently',()=>{
 assert.equal(setupReadiness(complete,configured).ready,true);
 for(const key of Object.keys(configured)){const result=setupReadiness(complete,{...configured,[key]:false});assert.equal(result.ready,false);assert(result.missing.includes(key));}
 assert.equal(setupReadiness({...complete,onboarding:{profileConfirmed:false}},configured).ready,false);
 assert.equal(setupReadiness({...complete,answerPack:{completed:false}},configured).ready,false);
 assert.equal(setupReadiness({...complete,profile:{...complete.profile,resumeText:''}},configured).ready,false);
});
test('draft identity activates account without changing confirmed source',()=>{
 const state={...complete,resumeDraft:{fields:{name:'Jordan Demo'}}};
 assert.deepEqual(profileIdentity(state),{name:'Jordan Demo',needsReview:true});assert.equal(state.profile.name,'Jane Doe');
 assert.deepEqual(profileIdentity(complete),{name:'Jane Doe',needsReview:false});
});
test('combined filters use real dates, unknown pay, source and latest task status',()=>{
 const now=Date.parse('2026-10-04T12:00:00Z');
 const jobs=[{id:'a',role:'Engineer',company:'Acme',location:'Remote',salary:'$120k',source:'Ashby',posted:'2026-10-04',match:70},{id:'b',role:'Designer',company:'Beta',location:'London',salary:'Pay not listed',source:'Lever',posted:'2026-09-01',match:95}];
 const tasks=[{jobId:'a',type:'prepare',status:'queued',updatedAt:'2026-10-03'},{jobId:'a',type:'fill',status:'needs_you',updatedAt:'2026-10-04'}];
 assert.equal(jobStatus(jobs[0],tasks),'needs_you');
 assert.deepEqual(filterJobs(jobs,{...defaultJobFilters,search:'engineer',location:'remote',source:'Ashby',age:'7',pay:'listed',status:'needs_you'},tasks,[],now).map(j=>j.id),['a']);
 assert.deepEqual(filterJobs(jobs,{...defaultJobFilters,pay:'missing'},tasks,[],now).map(j=>j.id),['b']);
 assert.deepEqual(filterJobs(jobs,{...defaultJobFilters,sort:'match'},tasks,[],now).map(j=>j.id),['b','a']);
 assert.equal(jobStatus(jobs[0],tasks,[{jobId:'a',status:'submitted'}]),'submitted');
});
