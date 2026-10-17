import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHttp, parseRobots, parseBoardUrl, harvestBoards, normalizePosting, dedupePostings, Registry, MemoryStore, JsonFileStore, PostgresStore, afterPoll, TIERS, runCollection, toDaymarkJob, withoutExistingJobs, scorePostings, titleMatchesRole, ATS_SOURCES, collectAggregators, resolveRedirect, discoverCommonCrawl, discoverSearx, buildQueries, harvestFromPostings } from '../job-sources/index.mjs';
import { HOUR, DAY } from '../job-sources/registry.mjs';

const json = (body, init) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const router = routes => { const calls = []; const fn = async (url, options = {}) => { calls.push({ url: String(url), options }); for (const [pattern, handler] of routes) if (String(url).includes(pattern)) return typeof handler === 'function' ? handler(String(url), options) : handler.clone(); return new Response('not found', { status: 404 }); }; fn.calls = calls; return fn; };
const http = fetch => createHttp({ fetch, delayMs: 0, sleep: async () => {}, retries: 1 });
const fill = url => /greenhouse|lever|ashby|myworkdayjobs|smartrecruiters/.test(url);

test('parseBoardUrl recognises every ATS URL shape and rejects look-alikes', () => {
  const cases = [
    ['https://boards.greenhouse.io/acme/jobs/123', { ats: 'greenhouse', token: 'acme', jobId: '123' }],
    ['https://job-boards.greenhouse.io/Acme', { ats: 'greenhouse', token: 'acme' }],
    ['https://boards.greenhouse.io/embed/job_app?for=acme&token=9', { ats: 'greenhouse', token: 'acme' }],
    ['https://jobs.lever.co/acme/abc-123', { ats: 'lever', token: 'acme', jobId: 'abc-123' }],
    ['https://jobs.ashbyhq.com/acme/uuid', { ats: 'ashby', token: 'acme', jobId: 'uuid' }],
    ['https://jobs.smartrecruiters.com/Acme/7436-data-engineer', { ats: 'smartrecruiters', token: 'Acme', jobId: '7436' }],
    ['https://apply.workable.com/acme/j/ABC123/', { ats: 'workable', token: 'acme', jobId: 'ABC123' }],
    ['https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin/Engineer_R1', { ats: 'workday', token: 'acme/wd5/Careers', site: 'Careers' }],
    ['https://acme.recruitee.com/o/data-engineer', { ats: 'recruitee', token: 'acme', jobId: 'data-engineer' }],
  ];
  for (const [url, want] of cases) assert.deepEqual({ ...parseBoardUrl(url), ...{} }, { ...parseBoardUrl(url), ...want }, url);
  for (const [url, want] of cases) for (const [k, v] of Object.entries(want)) assert.equal(parseBoardUrl(url)[k], v, `${url} ${k}`);
  for (const bad of ['https://greenhouse.io.evil.test/acme', 'https://boards.greenhouse.io/', 'https://www.recruitee.com/', 'notaurl', 'ftp://jobs.lever.co/acme', 'https://acme.wd5.myworkdayjobs.com/']) assert.equal(parseBoardUrl(bad), null, bad);
});

test('harvestBoards finds ATS links inside free text and html', () => {
  const found = harvestBoards('Apply: https://jobs.lever.co/acme/1. Also <a href="https://boards.greenhouse.io/beta/jobs/9">here</a> and https://example.com/x');
  assert.deepEqual(found.map(b => `${b.ats}:${b.token}`).sort(), ['greenhouse:beta', 'lever:acme']);
});

test('normalizePosting infers fields, tags manual apply, and dedupe prefers direct ATS copies', () => {
  const raw = { ats: 'greenhouse', board: 'acme', title: 'Senior Data Engineer', company: 'Acme', locations: ['Austin, TX'], description: '&lt;p&gt;5+ years of experience required. We cannot offer visa sponsorship. Active TS/SCI clearance.&lt;/p&gt;', applyUrl: 'https://boards.greenhouse.io/acme/jobs/1?utm_source=x', postedAt: '2026-10-01T00:00:00Z', salary: { min: 150000, max: 180000, currency: 'USD' } };
  const p = normalizePosting(raw, { canFill: fill });
  assert.equal(p.applyUrl, 'https://boards.greenhouse.io/acme/jobs/1');
  assert.equal(p.seniority, 'senior'); assert.equal(p.yearsExperience, 5); assert.equal(p.sponsorship, 'no'); assert.equal(p.clearance, true);
  assert.equal(p.applyMode, 'auto'); assert.equal(p.salary.text, '$150k–180k'); assert.ok(!p.description.includes('<'));
  const workable = normalizePosting({ ...raw, ats: 'workable', applyUrl: 'https://apply.workable.com/acme/j/A/' }, { canFill: fill });
  assert.equal(workable.applyMode, 'manual');
  assert.equal(normalizePosting({ ...raw, applyUrl: 'http://insecure.test/x' }), null);
  const agg = normalizePosting({ source: 'adzuna', title: 'Senior Data Engineer', company: 'ACME', locations: ['Austin, TX'], applyUrl: 'https://adzuna.example/ad/1', description: 'x' }, { canFill: fill });
  assert.equal(agg.dedupeKey, p.dedupeKey);
  const merged = dedupePostings([agg, p, p]);
  assert.equal(merged.length, 1); assert.equal(merged[0].ats, 'greenhouse');
});

test('ATS modules call the documented public endpoints and normalize their payloads', async () => {
  const f = router([
    ['boards-api.greenhouse.io/v1/boards/acme/jobs?content=true', json({ jobs: [{ id: 1, title: 'Data Engineer', location: { name: 'Remote' }, absolute_url: 'https://boards.greenhouse.io/acme/jobs/1', content: '&lt;b&gt;Build&lt;/b&gt;', updated_at: '2026-10-01T00:00:00Z', departments: [{ name: 'Data' }] }] })],
    ['api.lever.co/v0/postings/acme?mode=json', json([{ id: 'x', text: 'ML Engineer', categories: { location: 'NYC', team: 'AI' }, descriptionPlain: 'Do ML', hostedUrl: 'https://jobs.lever.co/acme/x', createdAt: 1790000000000, workplaceType: 'hybrid', salaryRange: { min: 1, max: 2, currency: 'USD', interval: 'per-year-salary' } }])],
    ['api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true', json({ jobs: [{ id: 'u', title: 'Analyst', location: 'SF', isRemote: true, descriptionPlain: 'Analyze', jobUrl: 'https://jobs.ashbyhq.com/acme/u', publishedAt: '2026-10-02T00:00:00Z', isListed: true }, { id: 'h', title: 'Hidden', jobUrl: 'https://jobs.ashbyhq.com/acme/h', isListed: false }] })],
    ['api.smartrecruiters.com/v1/companies/acme/postings/77', json({ jobAd: { sections: { jobDescription: { text: 'Detail text' } } }, postingUrl: 'https://jobs.smartrecruiters.com/acme/77-x?ref=1' })],
    ['api.smartrecruiters.com/v1/companies/acme/postings?limit=100&offset=0', json({ totalFound: 1, content: [{ id: '77', name: 'Engineer', releasedDate: '2026-10-03T00:00:00Z', company: { identifier: 'acme', name: 'Acme' }, location: { city: 'Austin', region: 'TX', country: 'us' } }] })],
    ['apply.workable.com/api/v3/accounts/acme/jobs', json({ results: [{ shortcode: 'AB1', title: 'Support', location: { city: 'Rome', country: 'Italy' }, remote: false, published: '2026-09-30' }] })],
    ['apply.workable.com/api/v2/accounts/acme/jobs/AB1', json({ description: 'Help' })],
    ['/wday/cxs/acme/Careers/jobs', (u, o) => json({ total: 1, jobPostings: [{ title: 'Data Scientist', externalPath: '/job/Austin/DS_R1', locationsText: 'Austin', postedOn: 'Posted 3 Days Ago', bulletFields: ['R1'] }] })],
    ['/wday/cxs/acme/Careers/job/Austin/DS_R1', json({ jobPostingInfo: { jobDescription: '<p>WD desc</p>', startDate: '2026-10-01' } })],
    ['acme.recruitee.com/api/offers/', json({ offers: [{ id: 5, title: 'Dev', status: 'published', city: 'Berlin', country: 'DE', description: '<p>Hi</p>', careers_url: 'https://acme.recruitee.com/o/dev', published_at: '2026-10-01' }] })],
  ]);
  const ctx = { http: http(f), wantDetail: () => true };
  const out = {};
  for (const [ats, board] of Object.entries({ greenhouse: { token: 'acme' }, lever: { token: 'acme' }, ashby: { token: 'acme' }, smartrecruiters: { token: 'acme' }, workable: { token: 'acme' }, workday: { token: 'acme/wd5/Careers' }, recruitee: { token: 'acme' } })) {
    out[ats] = (await ATS_SOURCES[ats].fetchBoard(board, ctx)).map(r => normalizePosting(r, { canFill: fill }));
  }
  assert.equal(out.greenhouse[0].description, 'Build'); assert.equal(out.greenhouse[0].remoteType, 'remote');
  assert.equal(out.lever[0].remoteType, 'hybrid'); assert.equal(out.lever[0].salary.min, 1);
  assert.equal(out.ashby.length, 1); assert.equal(out.ashby[0].remoteType, 'remote');
  assert.equal(out.smartrecruiters[0].description, 'Detail text'); assert.equal(out.smartrecruiters[0].applyUrl, 'https://jobs.smartrecruiters.com/acme/77-x');
  assert.equal(out.workable[0].applyUrl, 'https://apply.workable.com/acme/j/AB1'); assert.equal(out.workable[0].description, 'Help'); assert.equal(out.workable[0].applyMode, 'manual');
  assert.equal(out.workday[0].applyUrl, 'https://acme.wd5.myworkdayjobs.com/Careers/job/Austin/DS_R1'); assert.equal(out.workday[0].description, 'WD desc');
  assert.equal(out.recruitee[0].locations[0], 'Berlin, DE');
  const wd = f.calls.find(c => c.url.endsWith('/wday/cxs/acme/Careers/jobs'));
  assert.equal(wd.options.method, 'POST'); assert.equal(JSON.parse(wd.options.body).limit, 20);
});

test('http client throttles per host, retries 429, and honours robots.txt', async () => {
  let active = 0, peak = 0, hits = 0;
  const f = async url => {
    if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /private\n');
    if (String(url).includes('flaky')) return ++hits < 2 ? new Response('', { status: 429 }) : json({ ok: 1 });
    active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return json({ ok: 1 });
  };
  const h = createHttp({ fetch: f, delayMs: 0, perHostConcurrency: 2, sleep: async () => {} });
  await Promise.all(Array.from({ length: 8 }, (_, i) => h.json(`https://one.test/a${i}`)));
  assert.ok(peak <= 2, `peak concurrency ${peak}`);
  assert.deepEqual(await h.json('https://flaky.test/x'), { ok: 1 });
  assert.equal(await h.robotsAllows('https://one.test/private/page'), false);
  assert.equal(await h.robotsAllows('https://one.test/jobs'), true);
  assert.deepEqual(parseRobots('User-agent: DaymarkJobSources\nDisallow: /\n\nUser-agent: *\nAllow: /', 'DaymarkJobSources/1.0'), ['/']);
  const delays = []; let t = 0;
  const spaced = createHttp({ fetch: async () => json({}), delayMs: 100, perHostConcurrency: 1, now: () => t, sleep: async ms => { delays.push(ms); t += ms; } });
  await spaced.json('https://two.test/1'); await spaced.json('https://two.test/2');
  assert.ok(delays.some(ms => ms > 0 && ms <= 100), 'second request waited for the host delay');
});

test('afterPoll applies the 2h / daily / weekly / parked tiers and drops empty or dead boards', () => {
  const t0 = 1_800_000_000_000, base = { key: 'lever:a', ats: 'lever', token: 'a', firstSeenAt: t0, lastMatchAt: 0, verifiedAt: 0, failures: 0 };
  const hot = afterPoll(base, { ok: true, jobCount: 10, matchCount: 2 }, t0);
  assert.equal(hot.tier, 'hot'); assert.equal(hot.nextPollAt - t0, TIERS.hot);
  assert.equal(afterPoll(base, { ok: true, jobCount: 0 }, t0).status, 'dead');
  assert.equal(afterPoll(base, { ok: false, status: 404 }, t0).status, 'dead');
  const quiet = afterPoll({ ...base, verifiedAt: 1 }, { ok: true, jobCount: 5, matchCount: 0 }, t0 + HOUR);
  assert.equal(quiet.tier, 'daily');
  assert.equal(afterPoll({ ...base, verifiedAt: 1 }, { ok: true, jobCount: 5, matchCount: 0 }, t0 + 8 * DAY).tier, 'weekly');
  const parked = afterPoll({ ...base, verifiedAt: 1, lastMatchAt: t0 }, { ok: true, jobCount: 5, matchCount: 0 }, t0 + 61 * DAY);
  assert.equal(parked.tier, 'parked'); assert.equal(parked.status, 'parked');
  const failing = afterPoll({ ...base, verifiedAt: 1 }, { ok: false, status: 500 }, t0);
  assert.equal(failing.status, undefined); assert.ok(failing.nextPollAt > t0);
});

test('registry adds only unknown boards, orders due work, and persists to JSON', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'js-reg-')), file = path.join(dir, 'registry.json');
  let now = 1_800_000_000_000;
  const reg = await new Registry(new JsonFileStore(file), { now: () => now }).init();
  assert.equal((await reg.add([{ ats: 'lever', token: 'a' }, { ats: 'lever', token: 'A' }, { ats: 'ashby', token: 'b' }], 'test')).length, 2);
  assert.equal((await reg.add([{ ats: 'lever', token: 'a' }], 'test')).length, 0);
  await reg.setMeta('commoncrawl', { lastRunAt: 5 });
  const [first] = await reg.due();
  await reg.recordPoll(first, { ok: true, jobCount: 3, matchCount: 1 });
  assert.equal((await reg.due()).length, 1);
  now += 3 * HOUR; assert.equal((await reg.due()).length, 2);
  await reg.flush();
  const reopened = await new Registry(new JsonFileStore(file)).init();
  assert.equal((await reopened.stats()).total, 2); assert.equal((await reopened.meta('commoncrawl')).lastRunAt, 5);
  await fs.rm(dir, { recursive: true });
});

test('PostgresStore issues parameterised upserts through a pg-compatible pool', async () => {
  const queries = [], rows = new Map();
  const pool = { async query(sql, params = []) { queries.push(sql); if (/^INSERT/.test(sql)) rows.set(params[0], JSON.parse(params[5])); if (/WHERE board_key/.test(sql)) return { rows: rows.has(params[0]) ? [{ record: rows.get(params[0]) }] : [] }; if (/^SELECT record FROM/.test(sql)) return { rows: [...rows.values()].map(record => ({ record })) }; return { rows: [] }; } };
  const reg = await new Registry(new PostgresStore(pool)).init();
  assert.equal((await reg.add([{ ats: 'recruitee', token: 'x' }], 'harvest')).length, 1);
  assert.equal((await reg.add([{ ats: 'recruitee', token: 'x' }], 'harvest')).length, 0);
  assert.ok(queries.some(q => /CREATE TABLE IF NOT EXISTS daymark_job_boards/.test(q)));
  assert.ok(queries.some(q => /ON CONFLICT \(board_key\) DO UPDATE/.test(q)));
});

test('Common Crawl discovery extracts boards from CDX lines without real network', async () => {
  const f = router([
    ['collinfo.json', json([{ id: 'CC-MAIN-2026-40', 'cdx-api': 'https://index.commoncrawl.org/CC-MAIN-2026-40-index' }])],
    ['CC-MAIN-2026-40-index', (u) => {
      const page = new URL(u).searchParams.get('page'), pattern = new URL(u).searchParams.get('url');
      if (page !== '0') return new Response('', { status: 404 });
      const lines = pattern.startsWith('jobs.lever.co') ? ['https://jobs.lever.co/acme/1', 'https://jobs.lever.co/acme/2', 'https://jobs.lever.co/beta'] : pattern.includes('myworkdayjobs') ? ['https://x.wd1.myworkdayjobs.com/en-US/Ext/job/a'] : [];
      return new Response(lines.map(url => JSON.stringify({ url })).join('\n'));
    }],
  ]);
  const { index, boards } = await discoverCommonCrawl(http(f), { maxPages: 2 });
  assert.equal(index, 'CC-MAIN-2026-40');
  assert.deepEqual(boards.map(b => `${b.ats}:${b.token}`).sort(), ['lever:acme', 'lever:beta', 'workday:x/wd1/Ext']);
});

test('SearXNG discovery builds role-targeted queries and yields boards from results', async () => {
  const queries = buildQueries(['data engineer'], ['Texas'], { sites: ['jobs.lever.co', 'myworkdayjobs.com'] });
  assert.deepEqual(queries, ['site:jobs.lever.co "data engineer"', 'site:jobs.lever.co "data engineer" Texas', 'site:myworkdayjobs.com "data engineer"', 'site:myworkdayjobs.com "data engineer" Texas']);
  const f = router([['searx.local/search', (u) => json({ results: new URL(u).searchParams.get('q').includes('lever') ? [{ url: 'https://jobs.lever.co/gamma/9' }, { url: 'https://example.com' }] : [] })]]);
  const { boards } = await discoverSearx(http(f), 'http://searx.local/', queries);
  assert.deepEqual(boards.map(b => b.token), ['gamma']);
  assert.deepEqual(await discoverSearx(http(f), '', queries), { boards: [], urls: [] });
});

test('aggregators resolve to direct ATS postings and harvest every board they see', async () => {
  const f = router([
    ['api.adzuna.com', json({ results: [{ id: 1, title: 'Data Engineer', company: { display_name: 'Acme' }, location: { display_name: 'Austin, TX' }, description: 'Great', redirect_url: 'https://www.adzuna.com/land/ad/1', created: '2026-10-01T00:00:00Z' }] })],
    ['www.adzuna.com/land/ad/1', () => new Response(null, { status: 302, headers: { location: 'https://boards.greenhouse.io/acme/jobs/55?gh_src=adz' } })],
    ['remotive.com/api', json({ jobs: [{ id: 2, title: 'Data Engineer', company_name: 'Beta', url: 'https://remotive.com/job/2', description: 'See https://jobs.ashbyhq.com/beta/xyz for details', candidate_required_location: 'USA', publication_date: '2026-10-02' }] })],
    ['hn.algolia.com/api/v1/search_by_date', json({ hits: [{ objectID: '99', title: 'Ask HN: Who is hiring? (October 2026)' }] })],
    ['hn.algolia.com/api/v1/items/99', json({ children: [{ id: 7, created_at: '2026-10-01T00:00:00Z', text: 'Gamma | Senior Data Engineer | Remote | <a href="https:&#x2F;&#x2F;jobs.lever.co&#x2F;gamma&#x2F;abc">apply</a>' }] })],
  ]);
  const ctx = { http: http(f), config: { ADZUNA_APP_ID: 'i', ADZUNA_APP_KEY: 'k' }, roles: ['data engineer'], locations: [] };
  const { postings, boards, errors } = await collectAggregators(ctx, { enabled: ['adzuna', 'remotive', 'hn', 'usajobs'] });
  assert.deepEqual(errors, {});
  const byCompany = Object.fromEntries(postings.map(p => [p.company, p]));
  assert.equal(byCompany.Acme.applyUrl, 'https://boards.greenhouse.io/acme/jobs/55?gh_src=adz'); assert.equal(byCompany.Acme.ats, 'greenhouse');
  assert.equal(byCompany.Beta.ats, null);
  assert.equal(byCompany.Gamma.ats, 'lever'); assert.equal(byCompany.Gamma.applyUrl, 'https://jobs.lever.co/gamma/abc');
  assert.deepEqual(boards.map(b => `${b.ats}:${b.token}`).sort(), ['ashby:beta', 'greenhouse:acme', 'lever:gamma']);
  assert.equal(f.calls.filter(c => c.url.includes('data.usajobs.gov')).length, 0, 'keyless sources make no request');
  assert.equal(await resolveRedirect(http(f), 'https://example.org/x'), 'https://example.org/x');
});

test('scorePostings blends rules with an injected embedding and explains the score', async () => {
  const mk = (title, description, extra = {}) => normalizePosting({ ats: 'lever', board: 'a', title, company: 'A', description, applyUrl: `https://jobs.lever.co/a/${encodeURIComponent(title)}`, ...extra }, { canFill: fill });
  const near = mk('Data Engineer', 'Python SQL pipelines'), far = mk('Data Engineer', 'Welding and forklifts');
  const embed = async texts => texts.map(t => /welding/i.test(t) ? [0, 1] : [1, 0]);
  const scored = await scorePostings([near, far], { profileText: 'python sql', roles: ['data engineer'], embed });
  assert.ok(scored[0].score > scored[1].score + 30);
  assert.ok(scored[0].why.some(w => /Resume similarity/.test(w)) && scored[0].why.some(w => /target roles/.test(w)));
  const failing = await scorePostings([near], { profileText: 'x', roles: ['data engineer'], embed: async () => { throw new Error('model down'); } });
  assert.ok(failing[0].score >= 70, 'falls back to rules when the embedder fails');
  assert.equal(titleMatchesRole('Staff Machine Learning Engineer', ['machine learning engineer']), true);
  assert.equal(titleMatchesRole('Sales Manager', ['data engineer']), false);
});

test('runCollection discovers, polls, dedupes, filters and maps to feed jobs (no network)', async () => {
  const f = router([
    ['searx.local/search', json({ results: [{ url: 'https://jobs.lever.co/acme/1' }, { url: 'https://apply.workable.com/wk/j/Z/' }] })],
    ['api.lever.co/v0/postings/acme', json([
      { id: '1', text: 'Data Engineer', categories: { location: 'Austin, TX' }, descriptionPlain: 'Python. Requires security clearance: active TS/SCI.', hostedUrl: 'https://jobs.lever.co/acme/1', createdAt: 1790000000000 },
      { id: '2', text: 'Data Engineer II', categories: { location: 'Austin, TX' }, descriptionPlain: 'Python pipelines', hostedUrl: 'https://jobs.lever.co/acme/2', createdAt: 1790000000000 },
      { id: '3', text: 'Account Executive', categories: { location: 'Austin, TX' }, descriptionPlain: 'Sell', hostedUrl: 'https://jobs.lever.co/acme/3' }])],
    ['apply.workable.com/api/v3/accounts/wk/jobs', json({ results: [{ shortcode: 'Z', title: 'Data Engineer', location: { city: 'Austin', country: 'US' } }] })],
    ['remotive.com/api', json({ jobs: [{ id: 2, title: 'Data Engineer II', company_name: 'Acme', url: 'https://remotive.com/job/2', description: 'Python pipelines', candidate_required_location: 'Austin, TX' }] })],
  ]);
  const reg = await new Registry(new MemoryStore()).init();
  const progress = [];
  const { postings, stats } = await runCollection({ registry: reg, http: http(f), profile: { roleSearch: 'data engineer', locationSearch: 'Austin', masterResumeText: 'python' }, rules: { clearance: true }, config: { SEARXNG_URL: 'http://searx.local' }, aggregators: ['remotive'], onProgress: (v, m) => progress.push(m) });
  const titles = postings.map(p => `${p.posting.title}|${p.posting.applyMode}`);
  assert.deepEqual(titles, ['Data Engineer II|auto', 'Data Engineer|manual'], 'clearance role dropped, aggregator duplicate merged, filleable first, workable tagged manual');
  assert.equal(stats.polled >= 2, true); assert.ok(progress.length >= 3);
  assert.equal((await reg.get('lever:acme')).tier, 'hot');
  const job = toDaymarkJob(postings[0]);
  assert.match(job.id, /^ats-/); assert.equal(job.role, 'Data Engineer II'); assert.equal(job.applyMode, 'auto'); assert.ok(Array.isArray(job.matchWhy));
  assert.deepEqual(withoutExistingJobs(postings, [job]).map(p => p.posting.title), ['Data Engineer']);
  assert.ok(f.calls.every(c => !/apify/.test(c.url)), 'Apify is never touched');
  assert.equal(harvestFromPostings(postings.map(p => p.posting)).length >= 2, true);
});
