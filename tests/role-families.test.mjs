import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_FAMILIES, roleFamiliesForTitle, suggestRoleFamilies, collectionRoleTerms, matchesRoleTargets } from '../job-sources/role-families.mjs';
import { scorePostings } from '../job-sources/match.mjs';
import { buildQueries } from '../job-sources/discovery/searxng.mjs';
import { runCollection } from '../job-sources/collect.mjs';
import { MemoryStore, Registry } from '../job-sources/registry.mjs';

test('role taxonomy covers every requested family and common title aliases', () => {
  assert.equal(ROLE_FAMILIES.length, 22);
  assert.ok(roleFamiliesForTitle('Senior Machine Learning Engineer').includes('data-science-ml'));
  assert.ok(roleFamiliesForTitle('BI Developer').includes('data-analytics-bi'));
  assert.ok(roleFamiliesForTitle('Staff Software Engineer').includes('software-engineering'));
  assert.ok(roleFamiliesForTitle('Product Designer, UX').includes('design-ux-ui'));
  assert.ok(roleFamiliesForTitle('Data Engineer').includes('software-engineering'));
  assert.ok(roleFamiliesForTitle('Data Engineer').includes('data-analytics-bi'));
  assert.ok(roleFamiliesForTitle('ML Engineer').includes('data-science-ml'));
});

test('role classification supports overlapping titles and leaves unknown roles unclassified', () => {
  const overlapping = roleFamiliesForTitle('Clinical Data Analyst');
  assert.ok(overlapping.includes('data-analytics-bi'));
  assert.ok(overlapping.includes('healthcare-clinical-operations'));
  assert.deepEqual(roleFamiliesForTitle('Chief Unicorn'), []);
});

test('family suggestions are deduplicated and query terms stay bounded and rotate fairly', () => {
  assert.deepEqual(suggestRoleFamilies(['Data Analyst', 'BI Analyst']), ['data-analytics-bi']);
  const families = ['software-engineering', 'finance-accounting', 'marketing-growth'];
  const first = collectionRoleTerms('Platform Engineer, Staff Engineer', families, { limit: 5, rotation: 0 });
  const second = collectionRoleTerms('Platform Engineer, Staff Engineer', families, { limit: 5, rotation: 1 });
  assert.equal(first.length, 5);
  assert.equal(second.length, 5);
  assert.ok(first.slice(1).some(term => /software/i.test(term)));
  assert.notDeepEqual(first, second);
});

test('selected families expand collection and add an explainable match reason', async () => {
  assert.equal(matchesRoleTargets('Machine Learning Engineer', 'Data Analyst', ['data-science-ml']), true);
  assert.equal(matchesRoleTargets('Machine Learning Engineer', 'Data Analyst', []), false);
  assert.equal(matchesRoleTargets('Chief Unicorn', 'Chief Unicorn', []), true, 'custom titles stay searchable');
  const [result] = await scorePostings([{ title: 'Machine Learning Engineer', company: 'Example', locations: [], description: '', tags: [] }], { roleFamilies: ['data-science-ml'] });
  assert.ok(result.why.includes('Role family match: Data Science & ML'));
});

test('SearX query cap distributes requests across selected role terms and ATS sites', () => {
  const queries = buildQueries(['Title A', 'Title B', 'Family C'], [], { sites: ['ats-one.test', 'ats-two.test', 'ats-three.test'], maxQueries: 6 });
  assert.equal(queries.length, 6);
  for (const role of ['Title A', 'Title B', 'Family C']) assert.ok(queries.some(query => query.includes(`"${role}"`)));
  for (const site of ['ats-one.test', 'ats-two.test']) assert.ok(queries.some(query => query.includes(site)));
  const nextSweep = buildQueries(['Title A', 'Title B', 'Family C'], [], { sites: ['ats-one.test', 'ats-two.test', 'ats-three.test'], maxQueries: 3, rotation: 1 });
  assert.ok(nextSweep.every(query => query.includes('ats-two.test')), 'subsequent collection windows rotate coverage to other ATS sites');
});

test('family-only collection returns only selected-family roles and records why they match', async () => {
  const registry = await new Registry(new MemoryStore()).init();
  const http = { json: async () => ({ jobs: [
    { id: 'soft-1', title: 'Software Engineer', company_name: 'Example', url: 'https://remotive.com/job/soft-1', description: 'Build software.', candidate_required_location: 'Remote', publication_date: new Date().toISOString() },
    { id: 'sales-1', title: 'Sales Representative', company_name: 'Example', url: 'https://remotive.com/job/sales-1', description: 'Sell products.', candidate_required_location: 'Remote', publication_date: new Date().toISOString() },
  ] }) };
  const result = await runCollection({ registry, http, profile: { roleSearch: '', roleFamilies: ['software-engineering'], locationSearch: '' }, aggregators: ['remotive'], maxAgeDays: 0 });
  assert.deepEqual(result.postings.map(item => item.posting.title), ['Software Engineer']);
  assert.ok(result.postings[0].why.includes('Role family match: Software Engineering'));
});
