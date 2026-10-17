import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationFlowGuard, fieldVerification, humanReviewState } from '../application-flow.mjs';

test('detects a multi-step navigation cycle before revisiting the same form step', () => {
  const guard = createApplicationFlowGuard({ maxSteps: 12, maxVisits: 1 });
  assert.equal(guard.observe({ step: 'My Information', url: 'https://jobs.example/apply?session=one', signature: 'a' }).allowed, true);
  assert.equal(guard.observe({ step: 'My Experience', url: 'https://jobs.example/apply?session=two', signature: 'b' }).allowed, true);
  const result = guard.observe({ step: 'My Information', url: 'https://jobs.example/apply?session=three', signature: 'a' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'repeated_step');
});

test('allows a step to return with materially changed questions', () => {
  const guard = createApplicationFlowGuard({ maxSteps: 12, maxVisits: 1 });
  guard.observe({ step: 'Application Questions', url: 'https://jobs.example/apply', signature: 'before' });
  assert.equal(guard.observe({ step: 'Application Questions', url: 'https://jobs.example/apply', signature: 'after' }).allowed, true);
});

test('stops at the configured step limit even if every step is unique', () => {
  const guard = createApplicationFlowGuard({ maxSteps: 2, maxVisits: 4 });
  guard.observe({ step: 'One', url: 'https://jobs.example/apply', signature: '1' });
  guard.observe({ step: 'Two', url: 'https://jobs.example/apply', signature: '2' });
  assert.equal(guard.observe({ step: 'Three', url: 'https://jobs.example/apply', signature: '3' }).reason, 'step_limit');
});

test('maps pauses to explicit user-review states', () => {
  assert.deepEqual(humanReviewState('answers'), { kind: 'answers_needed', required: true });
  assert.deepEqual(humanReviewState('captcha'), { kind: 'verification_required', required: true });
  assert.deepEqual(humanReviewState('repeated_step'), { kind: 'flow_intervention', required: true });
});

test('reports only answers that were actually checked against the live form', () => {
  const rows = fieldVerification([
    { id: 'email', label: 'Email' },
    { id: 'phone', label: 'Phone' },
  ], { email: 'person@example.com', phone: '+1' }, { phone: 'Employer rejected this value.' });
  assert.deepEqual(rows, [
    { questionId: 'email', label: 'Email', status: 'verified', reason: '' },
    { questionId: 'phone', label: 'Phone', status: 'rejected', reason: 'Employer rejected this value.' },
  ]);
});

test('restoring the guard prevents resuming the same completed step endlessly',()=>{
 const first=createApplicationFlowGuard();
 first.observe({step:'Questions',url:'https://ats.example/apply?token=private',signature:'same',values:'filled'});
 const saved=first.snapshot();
 assert.equal(JSON.stringify(saved).includes('private'),false);
 const resumed=createApplicationFlowGuard({saved});
 assert.equal(resumed.observe({step:'Questions',url:'https://ats.example/apply',signature:'same',values:'filled'}).reason,'repeated_step');
 assert.equal(resumed.observe({step:'Questions',url:'https://ats.example/apply',signature:'same',values:'corrected'}).allowed,true);
});
