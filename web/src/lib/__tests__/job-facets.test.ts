import { describe, expect, it } from 'vitest';
import { placeOf, emptyPills, facetsOf, FRESHNESS, levelOf, matchesPills, skillsOf, sponsorsVisa, tintIndex, typeOf, workplaceOf } from '../job-facets';
import { defaultJobFilters, filterJobs } from '../ui-model';

describe('level', () => {
  it('reads internships, entry, and senior roles from the title', () => {
    expect(levelOf({ role: 'Data Engineering Intern' })).toBe('Internship');
    expect(levelOf({ role: 'Junior Data Analyst' })).toBe('Entry Level');
    expect(levelOf({ role: 'Associate Software Engineer' })).toBe('Entry Level');
    expect(levelOf({ role: 'Senior Data Engineer' })).toBe('Experienced');
    expect(levelOf({ role: 'Principal Architect' })).toBe('Experienced');
    expect(levelOf({ role: 'Data Engineer' })).toBe('');
  });
  it('uses stored seniority and years of experience when the title says nothing', () => {
    expect(levelOf({ role: 'Data Engineer', seniority: 'senior' })).toBe('Experienced');
    expect(levelOf({ role: 'Data Engineer', yearsExperience: 6 })).toBe('Experienced');
    expect(levelOf({ role: 'Data Engineer', yearsExperience: 3 })).toBe('Mid Level');
    expect(levelOf({ role: 'Data Engineer', yearsExperience: 1 })).toBe('Entry Level');
  });
});
describe('workplace and type', () => {
  it('prefers the stored workplace, then the text', () => {
    expect(workplaceOf({ remoteType: 'hybrid', location: 'Austin, TX' })).toBe('Hybrid');
    expect(workplaceOf({ remoteType: 'unknown', location: 'Remote - US' })).toBe('Remote');
    expect(workplaceOf({ location: 'Austin, TX' })).toBe('Onsite');
    expect(workplaceOf({ location: 'Location not listed' })).toBe('');
  });
  it('defaults to full time unless the posting says otherwise', () => {
    expect(typeOf({ role: 'Data Engineer' })).toBe('Full Time');
    expect(typeOf({ role: 'Data Engineer (Contract)' })).toBe('Contract');
    expect(typeOf({ role: 'Analyst', tags: ['Part-time'] })).toBe('Part Time');
  });
});
describe('skills and sponsorship', () => {
  it('finds known skills as whole words and keeps short ones strict', () => {
    const s = skillsOf({ role: 'Data Engineer', description: 'We use Python, SQL and Spark on AWS. Go-getters welcome. Rust belt office.' });
    expect(s).toEqual(expect.arrayContaining(['Python', 'SQL', 'Spark', 'AWS']));
    expect(s).not.toContain('R');
    expect(skillsOf({ role: 'x', description: 'JavaScript only' })).not.toContain('Java');
  });
  it('merges stored tags, drops duplicates and caps the list', () => {
    expect(skillsOf({ role: 'x', description: 'Python', tags: ['Python', 'Analytics'] })).toEqual(['Python', 'Analytics']);
    expect(skillsOf({ role: 'x', description: SKILL_HEAVY }, 5)).toHaveLength(5);
  });
  it('reports sponsorship from the stored value, else from clear wording', () => {
    expect(sponsorsVisa({ sponsorship: 'yes' })).toBe(true);
    expect(sponsorsVisa({ sponsorship: 'no', description: 'visa sponsorship available' })).toBe(false);
    expect(sponsorsVisa({ description: 'Visa sponsorship is available for this role.' })).toBe(true);
    expect(sponsorsVisa({ description: 'We do not offer visa sponsorship.' })).toBe(false);
    expect(sponsorsVisa({ description: 'Great team.' })).toBe(false);
  });
});
const SKILL_HEAVY = 'Python SQL Java Spark Kafka Airflow Snowflake Terraform Docker AWS';

describe('pill filters', () => {
  const jobs = [
    { id: 'a', role: 'Senior Data Engineer', location: 'Remote', remoteType: 'remote' },
    { id: 'b', role: 'Data Analyst Intern', location: 'Austin, TX', remoteType: 'onsite' },
    { id: 'c', role: 'Junior Analyst (Contract)', location: 'Remote', remoteType: 'remote', sponsorship: 'yes' },
    { id: 'd', role: 'Engineer', location: 'Location not listed' },
  ];
  const run = (pills: any) => filterJobs(jobs, { ...defaultJobFilters, age: '', pills: { ...emptyPills(), ...pills } }, [], []).map((j: any) => j.id).sort();
  it('ORs within a group and ANDs across groups', () => {
    expect(run({})).toEqual(['a', 'b', 'c', 'd']);
    expect(run({ workplaces: ['Remote'] })).toEqual(['a', 'c']);
    expect(run({ levels: ['Internship', 'Entry Level'] })).toEqual(['b', 'c']);
    expect(run({ workplaces: ['Remote'], levels: ['Entry Level'] })).toEqual(['c']);
    expect(run({ types: ['Contract'] })).toEqual(['c']);
    expect(run({ sponsors: true })).toEqual(['c']);
  });
  it('leaves out jobs whose value is unknown when a pill in that group is chosen', () => {
    expect(run({ workplaces: ['Onsite'] })).toEqual(['b']);
    expect(matchesPills({ role: 'Engineer' }, { ...emptyPills(), levels: ['Experienced'] })).toBe(false);
  });
  it('Experienced also takes mid-level roles', () => {
    expect(matchesPills({ role: 'Data Engineer', yearsExperience: 3 }, { ...emptyPills(), levels: ['Experienced'] })).toBe(true);
  });
  it('filters role families, preserves unknowns under Other, and leaves unknowns visible by default', () => {
    expect(matchesPills({ role: 'Machine Learning Engineer' }, { ...emptyPills(), roleFamilies: ['data-science-ml'] })).toBe(true);
    expect(matchesPills({ role: 'Chief Unicorn' }, { ...emptyPills(), roleFamilies: ['other'] })).toBe(true);
    expect(matchesPills({ role: 'Chief Unicorn' }, emptyPills())).toBe(true);
    expect(matchesPills({ role: 'Chief Unicorn' }, { ...emptyPills(), roleFamilies: ['software-engineering'] })).toBe(false);
  });
});
describe('tint', () => {
  it('is stable per company and within range', () => {
    expect(tintIndex('Stripe')).toBe(tintIndex('Stripe'));
    for (const c of ['A', 'Stripe', 'Zen Technologies', '']) expect(tintIndex(c)).toBeGreaterThanOrEqual(0), expect(tintIndex(c)).toBeLessThan(6);
    expect(facetsOf({ role: 'x' }).skills).toEqual([]);
  });
});

describe('freshness options', () => {
  it('offers a visible six-hour window that the existing age filter can apply', () => {
    expect(FRESHNESS).toContainEqual({ label: 'Past 6 hours', days: 0.25 });
    const now = Date.parse('2026-10-20T12:00:00Z');
    const at = (ms: number) => new Date(now - ms).toISOString();
    const jobs = [
      { id: 'inside', posted: at(5 * 60 * 60 * 1000) },
      { id: 'boundary', posted: at(6 * 60 * 60 * 1000) },
      { id: 'outside', posted: at(6 * 60 * 60 * 1000 + 1) },
      { id: 'first-seen', posted: '', first_seen_at: at(2 * 60 * 60 * 1000) },
    ];
    expect(filterJobs(jobs, { ...defaultJobFilters, age: '0.25' }, [], [], now).map(j => j.id)).toEqual(['first-seen', 'inside', 'boundary']);
  });
});

describe('placeOf', () => {
  it('keeps normal places and drops sentences that were pasted into the location field', () => {
    expect(placeOf({ location: 'Austin, TX' })).toBe('Austin, TX');
    expect(placeOf({ location: 'Location not listed' })).toBe('');
    expect(placeOf({ location: 'REMOTE (US only, US time zones; no visa sponsorship) · $170k–$210k + 0.1%–0.25% equity We build software that hospitals use' })).toBe('REMOTE');
    expect(placeOf({ location: 'Remote, United States · Boston, Massachusetts, United States · Chicago, Illinois, United States' }).length).toBeLessThanOrEqual(48);
    expect(placeOf({})).toBe('');
  });
});
