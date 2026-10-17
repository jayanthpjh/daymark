import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutTargetCompany, claimsInResume, analyzeJob, atsKeywordScore, classifyLine, tailorResume, consistencyWarnings, parseResume, identityLinesIntact } from '../tailoring-engine.mjs';
import { masterResume, missingProtectedResumeFacts } from '../public/workflow.js';

const profile = {
  name: 'Alex Doe', email: 'alex@example.test', phone: '555-0100',
  headline: 'Data engineer building batch pipelines on Snowflake and Airflow.',
  skills: 'Python, SQL, Snowflake, Airflow',
  workHistory: 'Senior Data Engineer, Northwind Analytics\nMar 2021 - Present\n- Rebuilt 120 dbt models on Snowflake, reducing compute cost.\n- Ran Airflow pipelines feeding the finance warehouse.\nData Engineer, Contoso Retail\nJun 2018 - Feb 2021\n- Built PySpark jobs on EMR for sales forecasting.',
  education: 'B.S. Computer Science, University of Texas at Austin, 2018',
};
const source = masterResume(profile);
const jd = 'Senior Data Engineer. Requirements: Snowflake, dbt, Kafka streaming, Terraform, Airflow. Python and SQL. 5+ years of experience. Nice to have: Databricks.';
const hdr1 = 'Senior Data Engineer, Northwind Analytics';

const plan = (over = {}) => ({
  summary: 'Data engineer building Snowflake and Airflow pipelines.',
  skills: ['Python, SQL, Snowflake, Airflow'],
  experience: [{ header: hdr1, bullets: [
    { text: 'Rebuilt 120 dbt models on Snowflake, reducing compute cost.' },
    { text: 'Owned Airflow pipelines that feed the finance warehouse.' },
    { text: 'Built Kafka streaming ingestion with Terraform, cutting latency from 6 hours to 5 minutes.' },
  ] }],
  coverLetter: 'Your Snowflake platform is where I want to work. I rebuilt 120 dbt models there. I would like to talk.',
  ...over,
});

test('job analysis finds required keywords and the keyword score rises when the resume covers them', () => {
  const analysis = analyzeJob(jd);
  assert.ok(analysis.keywords.some(item => item.term === 'snowflake' && item.required));
  assert.equal(analysis.seniority, 'senior');
  const low = atsKeywordScore('Alex Doe\nWorked on pipelines', analysis).score;
  const high = atsKeywordScore(source + '\nKafka Terraform dbt', analysis).score;
  assert.ok(high > low);
});

test('line classification separates source, rewritten and invented text', () => {
  const analysis = analyzeJob(jd);
  const lines = ['- Rebuilt 120 dbt models on Snowflake, reducing compute cost.'];
  assert.equal(classifyLine('Rebuilt 120 dbt models on Snowflake, reducing compute cost.', lines, source, analysis).kind, 'source');
  assert.equal(classifyLine('Rebuilt 120 dbt models on Snowflake to reduce compute cost', lines, source, analysis).kind, 'rewritten');
  assert.equal(classifyLine('Rebuilt 120 dbt models on Snowflake, cutting compute cost 38%.', lines, source, analysis).kind, 'invented');
  assert.equal(classifyLine('Designed Kafka streaming ingestion with Terraform.', lines, source, analysis).kind, 'invented');
});

test('honest mode only reorders: no claims, no letter', async () => {
  const result = await tailorResume({ mode: 'honest', source, description: jd, profile });
  assert.equal(result.claims.length, 0);
  assert.equal(result.coverLetter, '');
  assert.equal(missingProtectedResumeFacts(result.resume, profile).length, 0);
});

test('strong mode keeps rewrites and drops anything invented, including cover-letter figures', async () => {
  const result = await tailorResume({ mode: 'strong', source, description: jd, profile, llm: async () => plan({ coverLetter: 'Your platform fits my work. I cut latency from 6 hours to 5 minutes.' }) });
  assert.equal(result.mode, 'strong');
  assert.ok(result.resume.includes('Owned Airflow pipelines'));
  assert.ok(!result.resume.includes('Kafka'));
  assert.equal(result.claims.length, 0);
  assert.equal(result.coverLetter, '', 'a letter with a figure the resume lacks is dropped');
});

test('aggressive mode adds realistic claims, tags each one, and builds prep notes and a better keyword score', async () => {
  const result = await tailorResume({ mode: 'aggressive', source, description: jd, profile, llm: async () => plan({ skills: ['Python, SQL, Snowflake, Airflow', 'Kafka, Terraform'], coverLetter: 'Your platform fits my work. I cut latency from 6 hours to 5 minutes. I would like to talk.' }) });
  assert.equal(result.fellBack, false);
  assert.ok(result.resume.includes('Kafka streaming ingestion'));
  const invented = result.changes.filter(item => item.kind === 'invented');
  assert.ok(invented.length >= 2);
  assert.ok(invented.some(item => item.novel.includes('6hours') || item.novel.includes('5minutes') || item.novel.includes('kafka')));
  assert.ok(result.claims.length >= 2);
  assert.equal(result.prep.length, result.claims.length);
  assert.match(result.prep[0].likelyQuestion, /Tell me about/);
  assert.ok(result.keywordScore.after > result.keywordScore.before);
  assert.ok(result.coverLetter.includes('latency'));
  assert.ok(result.claims.some(item => item.section === 'Cover letter'));
  assert.equal(missingProtectedResumeFacts(result.resume, profile).length, 0);
});

test('a model that changes an employer, title, date or degree is rejected and the original wording is kept', async () => {
  for (const mutate of [
    plan({ experience: [{ header: 'Principal Engineer, Northwind Analytics', bullets: [{ text: 'Ran things.' }] }] }),
  ]) {
    const result = await tailorResume({ mode: 'aggressive', source, description: jd, profile, llm: async () => mutate });
    assert.equal(result.fellBack, false, 'an unknown header is ignored, not applied');
    assert.ok(result.resume.includes('Mar 2021 - Present'));
  }
  const tampered = source.replace('Mar 2021 - Present', 'Mar 2019 - Present');
  assert.deepEqual(identityLinesIntact(source, tampered), ['EXPERIENCE']);
  assert.deepEqual(identityLinesIntact(source, source.replace('Austin, 2018', 'Austin, 2016')), ['EDUCATION']);
  const fake = await tailorResume({ mode: 'aggressive', source, description: jd, profile, llm: async () => ({ ...plan(), summary: 'Data engineer, M.S. Computer Science, MIT.' }) });
  assert.ok(!fake.resume.includes('MIT'), 'a degree the resume lacks is never introduced');
  const cert = await tailorResume({ mode: 'aggressive', source, description: jd, profile, llm: async () => plan({ skills: ['Python, SQL', 'AWS Certified Solutions Architect'] }) });
  assert.ok(!cert.resume.includes('Certified'));
  assert.ok(fake.resume.includes('B.S. Computer Science, University of Texas at Austin, 2018'));
});

test('sections the profile lacks never appear, and certifications are never invented', async () => {
  const result = await tailorResume({ mode: 'aggressive', source, description: jd, profile, llm: async () => ({ ...plan(), certifications: ['AWS Certified Solutions Architect'] }) });
  assert.ok(!/CERTIFICATIONS/.test(result.resume));
  assert.ok(!/PROJECTS/.test(result.resume));
  assert.ok(!result.resume.includes('AWS Certified'));
  assert.deepEqual(parseResume(result.resume).map(item => item.label), ['HEADER', 'SUMMARY', 'SKILLS', 'EXPERIENCE', 'EDUCATION']);
});

test('education and certification lines are protected facts', () => {
  assert.ok(missingProtectedResumeFacts(source.replace('University of Texas at Austin', 'MIT'), profile).length > 0);
});

test('the model is required for strong and aggressive modes, and unknown modes are rejected', async () => {
  await assert.rejects(tailorResume({ mode: 'aggressive', source, description: jd, profile }), /model is required/);
  await assert.rejects(tailorResume({ mode: 'reckless', source, description: jd, profile }), /Unknown tailoring mode/);
});

test('consistency check warns when a claim for the same company changes its figures', () => {
  const ledger = [{ company: 'Acme', role: 'Data Engineer', claim: 'Cut warehouse cost 38% by rebuilding dbt models on Snowflake.' }];
  const warnings = consistencyWarnings(ledger, [{ claim: 'Cut warehouse cost 52% by rebuilding dbt models on Snowflake.' }], 'acme');
  assert.equal(warnings.length, 1);
  assert.deepEqual(consistencyWarnings(ledger, [{ claim: 'Cut warehouse cost 38% by rebuilding dbt models on Snowflake.' }], 'Acme'), []);
  assert.deepEqual(consistencyWarnings(ledger, [{ claim: 'Cut warehouse cost 52% by rebuilding dbt models on Snowflake.' }], 'Globex'), []);
});

test('claims in a final resume are recomputed from its text, including lines the user typed', async () => {
  const aggressive = await tailorResume({ mode: 'aggressive', source, description: jd, profile, llm: async () => plan() });
  const claims = claimsInResume({ resume: aggressive.resume, source, description: jd });
  assert.ok(claims.some(item => /Kafka/.test(item.claim)));
  const struck = aggressive.resume.split('\n').filter(line => !/Kafka/.test(line)).join('\n');
  assert.equal(claimsInResume({ resume: struck, source, description: jd }).length, 0, 'striking the line removes the claim');
  const typed = source.replace('- Built PySpark jobs on EMR for sales forecasting.', '- Built PySpark jobs on EMR, saving $2M a year.');
  assert.ok(claimsInResume({ resume: typed, source, description: jd }).some(item => item.novel.includes('$2m') || item.novel.length), 'a user-typed figure is a claim too');
});

test('a dated bullet is accomplishment text: rewriting it does not trip the identity guard', async () => {
  const dated = { ...profile, workHistory: profile.workHistory.replace('- Rebuilt 120 dbt models on Snowflake, reducing compute cost.', '- Led the September 2026 production cutover and rebuilt 120 dbt models on Snowflake, reducing compute cost.') };
  const datedSource = masterResume(dated);
  const result = await tailorResume({ mode: 'aggressive', source: datedSource, description: jd, profile: dated, llm: async () => plan({ experience: [{ header: hdr1, bullets: [{ text: 'Led the September 2026 production cutover, rebuilding 120 dbt models on Snowflake to reduce compute cost.' }, { text: 'Owned Airflow pipelines that feed the finance warehouse.' }] }] }) });
  assert.equal(result.fellBack, false, result.fallbackReason);
  assert.ok(result.resume.includes('Led the September 2026 production cutover, rebuilding'));
  assert.ok(result.resume.includes('Mar 2021 - Present'), 'the real employment date line is still protected');
  const moved = masterResume(dated).replace('Mar 2021 - Present', 'Mar 2019 - Present');
  assert.ok(missingProtectedResumeFacts(moved, dated).length > 0);
});

test('function words never show up as missing keywords', () => {
  const analysis = analyzeJob('We are hiring. You will work with SQL or Python. This is a Snowflake role and we use dbt.');
  const terms = analysis.keywords.map(item => item.term);
  for (const word of ['we', 'or', 'is', 're']) assert.ok(!terms.includes(word), word);
});

test('a role named by title and dates joined together still matches, and your own skills line stays as written', async () => {
  const result = await tailorResume({ mode: 'aggressive', source, description: jd, profile, llm: async () => plan({
    skills: ['Python', 'SQL', 'Snowflake', 'Airflow', 'Kafka', 'Terraform', 'Veteran-friendly workplace advocacy'],
    experience: [{ header: `${hdr1}\nMar 2021 - Present`, bullets: [{ text: 'Rebuilt 120 dbt models on Snowflake, reducing compute cost.' }, { text: 'Owned Airflow pipelines that feed the finance warehouse.' }] }],
  }) });
  assert.equal(result.fellBack, false);
  assert.ok(result.resume.includes('Owned Airflow pipelines that feed the finance warehouse.'), 'the joined header matched the role');
  assert.ok(result.resume.includes('Python, SQL, Snowflake, Airflow'), 'the original skills line is untouched');
  assert.ok(result.resume.includes('Kafka, Terraform'), 'new skills are appended on one line');
  assert.ok(!/veteran/i.test(result.resume), 'a veteran or military claim is never invented');
});

test('aggressive mode caps how many skills it adds, and strong mode adds none', async () => {
  const many = Array.from({ length: 25 }, (_, i) => `Tool${i}ks`);
  const aggressive = await tailorResume({ mode: 'aggressive', source, description: jd, profile, llm: async () => plan({ skills: ['Python', ...many], experience: [] }) });
  assert.ok(aggressive.changes.filter(item => item.section === 'Skills').length <= 8);
  const strong = await tailorResume({ mode: 'strong', source, description: jd, profile, llm: async () => plan({ skills: ['Python', ...many], experience: [] }) });
  assert.equal(strong.changes.filter(item => item.section === 'Skills').length, 0);
});

test('past-work lines never name the target company: a trailing "applying the same rigor to X" clause is cut', async () => {
  assert.deepEqual(withoutTargetCompany('Built pipelines on Snowflake, cutting cost—applying the same rigor to Acme\u2019s platform.', 'Acme, Inc.'), { text: 'Built pipelines on Snowflake, cutting cost.', dropped: false });
  assert.equal(withoutTargetCompany('Built pipelines for Acme customers.', 'Acme').dropped, true);
  assert.equal(withoutTargetCompany('Built pipelines on Snowflake.', 'Acme').text, 'Built pipelines on Snowflake.');
  const result = await tailorResume({ mode: 'aggressive', source, description: jd, profile, company: 'Acme', llm: async () => plan({ experience: [{ header: hdr1, bullets: [
    { text: 'Rebuilt 120 dbt models on Snowflake, reducing compute cost\u2014applying the same expertise to Acme\u2019s warehouse.' },
    { text: 'Owned Airflow pipelines for Acme finance reporting.' } ] }] }) });
  assert.ok(!/acme/i.test(result.resume.split('EDUCATION')[0].replace('Northwind Analytics', '')), 'the target company is not in the resume');
  assert.ok(result.resume.includes('- Rebuilt 120 dbt models on Snowflake, reducing compute cost.'), 'the clause was cut and the bullet kept');
});

test('mirroring plain words is not a claim, but naming a tool the candidate never used is', async () => {
  const analysis = analyzeJob('We need a data engineer for our healthcare teams with Snowflake, Kafka and dbt. Customer data matters. Experience with HIPAA required.');
  const lines = ['- Rebuilt 120 dbt models on Snowflake, reducing compute cost.'];
  assert.equal(classifyLine('Rebuilt 120 dbt models on Snowflake for healthcare teams, reducing compute cost.', lines, source, analysis).kind, 'rewritten');
  assert.equal(classifyLine('Rebuilt 120 dbt models on Snowflake with Kafka, reducing compute cost.', lines, source, analysis).kind, 'invented');
  assert.equal(classifyLine('Rebuilt 120 dbt models on Snowflake under HIPAA controls, reducing compute cost.', lines, source, analysis).kind, 'invented');
});
