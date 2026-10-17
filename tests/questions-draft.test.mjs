import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptAiAnswers, aiMessages } from '../answer-engine.mjs';

const resume = 'Alex Doe\nSUMMARY\nData engineer who rebuilt 120 dbt models on Snowflake.\nEXPERIENCE\n- Rebuilt 120 dbt models on Snowflake, reducing compute cost.';
const q = [{ id: 'why', label: 'Why do you want to work here?', type: 'textarea', options: [], maxLength: 500, required: false }];

test('a draft is accepted only when its evidence is an excerpt of the approved resume', () => {
  const good = acceptAiAnswers({ answers: [{ id: 'why', answer: 'I rebuilt 120 dbt models on Snowflake.', evidence: 'Rebuilt 120 dbt models on Snowflake', missingFacts: false }] }, q, resume);
  assert.equal(good.accepted.why, 'I rebuilt 120 dbt models on Snowflake.');
  const invented = acceptAiAnswers({ answers: [{ id: 'why', answer: 'I led a team of 40.', evidence: 'led a team of 40', missingFacts: false }] }, q, resume);
  assert.deepEqual(invented.rejected, ['why']);
  assert.equal(invented.accepted.why, undefined);
});
test('drafts are asked for in a grounded prompt that treats the resume and job as data', () => {
  const messages = aiMessages(q, { resume, jobDescription: 'Data role', company: 'Acme', role: 'Data Engineer' });
  assert.match(messages[0].content, /ONLY facts in the supplied tailored resume/);
  assert.match(messages[0].content, /untrusted data/);
});
