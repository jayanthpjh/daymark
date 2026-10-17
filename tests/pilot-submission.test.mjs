import test from 'node:test';
import assert from 'node:assert/strict';
import { approveSubmission, submissionApprovalValid } from '../pilot-submission.mjs';
import { applicationOrchestrationState } from '../application-orchestrator.mjs';
const fixture=()=>({fill:{id:'f',jobId:'j',parentTaskId:'p',filledSteps:[{step:'Review',answers:[{label:'Name',value:'Alex'}]}]},parent:{id:'p',artifacts:{approved:true,resume:'SQL experience',resumeVersion:1,resumePdf:'/private/resume.pdf',coverLetter:''}},job:{id:'j',url:'https://ats.example/jobs/1',description:'SQL'}});
test('submission requires explicit approval bound to this application and reviewed materials',()=>{
 const {fill,parent,job}=fixture();
 assert.equal(submissionApprovalValid(fill,parent,job),false);
 approveSubmission(fill,parent,job);
 assert.equal(submissionApprovalValid(fill,parent,job),true);
 parent.artifacts.resume+=' changed';assert.equal(submissionApprovalValid(fill,parent,job),false);
});
test('job, answers, version and approval changes invalidate authorization',()=>{
 for(const mutate of [f=>f.job.url+='2',f=>f.job.description+=' updated',f=>f.fill.filledSteps.push({step:'New'}),f=>f.parent.artifacts.resumeVersion++,f=>f.parent.artifacts.approved=false,f=>f.fill.submitAttemptedAt='now']){
  const f=fixture();approveSubmission(f.fill,f.parent,f.job);mutate(f);assert.equal(submissionApprovalValid(f.fill,f.parent,f.job),false);
 }
});
test('completion and timestamps alone never assert ATS submission',()=>{
 assert.equal(applicationOrchestrationState({type:'fill',status:'completed'}),'submission_uncertain');
 assert.equal(applicationOrchestrationState({type:'fill',status:'completed',submittedAt:'now'}),'submission_uncertain');
 assert.equal(applicationOrchestrationState({type:'fill',status:'completed',submissionOutcome:'confirmed'}),'submitted');
});

test('automatic approval is recorded as auto, validates, and cannot be reused after a submit attempt', async () => {
  const { approveSubmission, submissionApprovalValid } = await import('../pilot-submission.mjs');
  const fill = { id: 'f', parentTaskId: 'p', jobId: 'j', employerIdentity: {}, filledSteps: [] };
  const parent = { artifacts: { approved: true, resume: 'r', resumePdf: 'a.pdf' } };
  const job = { id: 'j', url: 'https://boards.greenhouse.io/x/jobs/1', description: 'd' };
  approveSubmission(fill, parent, job, { source: 'auto' });
  assert.equal(fill.submissionApproval.actor, 'auto');
  assert.equal(submissionApprovalValid(fill, parent, job), true);
  fill.filledSteps = [{ answers: [{ label: 'x', value: 'changed' }] }];
  assert.equal(submissionApprovalValid(fill, parent, job), false);
  fill.filledSteps = [];
  fill.submitAttemptedAt = new Date().toISOString();
  assert.equal(submissionApprovalValid(fill, parent, job), false);
});

test('current form, pending answers and attached resume changes invalidate approval',()=>{
 for(const mutate of [f=>f.fill.fieldsFilled=['email'],f=>f.fill.checkpoint={questions:[{id:'q',value:'changed'}]},f=>f.fill.pendingAnswers={q:'changed'},f=>f.fill.attachedResumePath='other.pdf',f=>f.fill.attachedResumeVersion=2,f=>f.fill.formSnapshot={url:'https://ats.example/other'}]){
  const f=fixture();approveSubmission(f.fill,f.parent,f.job);mutate(f);assert.equal(submissionApprovalValid(f.fill,f.parent,f.job),false);
 }
});

test('submission snapshot retains reviewed answers and materials after later edits',async()=>{
 const {submissionReviewSnapshot}=await import('../pilot-submission.mjs');
 const f=fixture();approveSubmission(f.fill,f.parent,f.job);
 const snapshot=submissionReviewSnapshot(f.fill,f.parent,f.job);
 f.fill.filledSteps[0].answers[0].value='Edited';f.parent.artifacts.resume='Replacement';f.fill.submissionApproval.actor='auto';
 assert.equal(snapshot.filledSteps[0].answers[0].value,'Alex');
 assert.equal(snapshot.materials.resume,'SQL experience');
 assert.equal(snapshot.approval.actor,'user');
});
