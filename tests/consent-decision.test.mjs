import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswers, isConsentControl } from '../application-questions.mjs';
import { buildQuestionInbox } from '../public-legacy/questions-model.js';

const consent = { id: 'sms', label: 'By selecting YES, I consent to receive recruiting SMS messages from Eve at the phone number provided on my job application.', type: 'custom', manual: true, required: false, options: [], value: '' };
const privacy = { id: 'box', label: 'Airbnb Candidate Privacy Policy*', type: 'custom', manual: true, required: true, options: [], value: '' };
const unknownWidget = { id: 'w', label: 'Upload your portfolio link', type: 'custom', manual: true, required: false, options: [], value: '' };

test('a consent control accepts only Yes or No, chosen by the applicant', () => {
  assert.equal(isConsentControl(consent), true);
  assert.equal(validateAnswers([consent], { sms: 'No' }).answers.sms, 'No');
  assert.equal(validateAnswers([consent], { sms: 'Maybe' }).errors.sms, 'Choose Yes or No.');
});
test('other manual widgets are still resolved in the browser, never answered from Daymark', () => {
  assert.equal(isConsentControl(unknownWidget), false);
  assert.match(validateAnswers([unknownWidget], { w: 'x' }).errors.w, /application browser/);
});
test('a consent box appears as a Yes/No decision card in the Questions inbox, not as an employer-page note', () => {
  const task = { id: 't1', type: 'fill', jobId: 'j', status: 'needs_you', company: 'Eve', role: 'Senior Data Engineer', checkpoint: { id: 'cp', step: 'Application', pauseReason: 'answers', unresolvedIds: ['sms', 'w'], questions: [consent, unknownWidget] } };
  const inbox = buildQuestionInbox([task], [{ id: 'j', company: 'Eve', role: 'Senior Data Engineer' }]);
  const card = inbox.groups.find(g => g.meta.kind === 'consent');
  assert.ok(card, 'consent card exists');
  assert.deepEqual(card.options.map(o => o.value), ['Yes', 'No']);
  assert.equal(inbox.employerPage.length, 1, 'other manual widgets stay on the employer page');
  assert.equal(inbox.employerPage[0].label, 'Upload your portfolio link');
});
