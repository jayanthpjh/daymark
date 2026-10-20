// Orchestrates one collection cycle: discover boards, poll the due ones, pull free aggregators, then
// normalize, dedupe, filter, score and map to Daymark job records. Everything external is injected.
import { createHttp } from './http.mjs';
import { ATS_SOURCES } from './ats/index.mjs';
import { collectAggregators, AGGREGATORS } from './aggregators/index.mjs';
import { discoverCommonCrawl } from './discovery/commoncrawl.mjs';
import { discoverSearx, buildQueries } from './discovery/searxng.mjs';
import { harvestFromPostings } from './discovery/harvest.mjs';
import { normalizePosting, dedupePostings, canonicalUrl, dedupeKey } from './schema.mjs';
import { splitRoles, titleMatchesRole, locationMatches, ruleFilter, scorePostings } from './match.mjs';
import { detectATSAdapter } from '../ats-adapters.mjs';
import { DAY } from './registry.mjs';
import { withinAge } from './freshness.mjs';
import { collectionRoleTerms, matchesRoleTargets, roleFamiliesForTitle } from './role-families.mjs';

export const DEFAULT_AGGREGATORS = Object.freeze(['adzuna', 'usajobs', 'themuse', 'remotive', 'remoteok', 'arbeitnow', 'hn', 'jobicy', 'himalayas']);

/** The id a feed job gets from a posting. Snapshots use the same ids so a listing can be compared with the feed. */
export const jobIdOf = posting => `ats-${posting.id}`;
export const defaultCanFill = url => { try { return Boolean(detectATSAdapter(new URL(url).hostname)); } catch { return false; } };

async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

/** Poll one registry record through its ATS module. Never throws. */
/** One board that never answers must not stall a whole run: give up on it after a deadline (the timer keeps the process alive meanwhile). */
export function withDeadline(promise, ms, label = 'board') {
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`${label} took longer than ${Math.round(ms / 1000)} s`), { status: 504 })), ms); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export async function pollBoard(registry, record, { http, roles, targetRoles = roles, roleFamilies = [], canFill, snapshotDetail = false, boardDeadlineMs = 120_000, boardConcurrencyContext = {} }) {
  const source = ATS_SOURCES[record.ats];
  if (!source) return { postings: [], result: await registry.recordPoll(record, { ok: false, error: `No module for ${record.ats}`, status: 404 }) };
  try {
    const raw = await withDeadline(source.fetchBoard(record, { http, searchTerms: roles.slice(0, 6), wantDetail: p => (!targetRoles.length && !roleFamilies.length) || titleMatchesRole(p.title, targetRoles) || roleFamiliesForTitle(p.title).some(id => roleFamilies.includes(id)), ...boardConcurrencyContext }), boardDeadlineMs, record.key);
    const postings = raw.map(r => normalizePosting({ ...r, company: r.company === record.token ? (record.company || r.company) : r.company }, { canFill })).filter(Boolean);
    // Everything the board listed, before role filtering. Only a complete list can later show that a job was taken down.
    const complete = !(raw.truncated || source.snapshot === 'partial');
    const openIds = complete ? postings.map(jobIdOf) : null;
    // The trial keeps a short description of each open job so a later run can show which ones disappeared.
    const openItems = complete && snapshotDetail ? postings.slice(0, 400).map(p => ({ id: jobIdOf(p), url: p.applyUrl, title: p.title, company: p.company })) : undefined;
    const matches = (targetRoles.length || roleFamilies.length) ? postings.filter(p => titleMatchesRole(p.title, targetRoles) || roleFamiliesForTitle(p.title).some(id => roleFamilies.includes(id))) : postings;
    const updated = await registry.recordPoll({ ...record, company: record.company || postings[0]?.company || null }, { ok: true, jobCount: postings.length, matchCount: matches.length });
    return { postings: matches, result: updated, openIds, openItems };
  } catch (error) {
    return { postings: [], result: await registry.recordPoll(record, { ok: false, error: error.message, status: error.status }) };
  }
}

/**
 * @returns {{ postings: Array<{posting, score, why}>, stats: object }} scored postings (best first).
 */
export async function runCollection({
  registry, http = createHttp(), profile = {}, rules = {}, config = {}, embed = null, canFill = defaultCanFill,
  aggregators = DEFAULT_AGGREGATORS, maxBoardsPerRun = 800, boardConcurrency = 6, onPostings = async () => {},
  commonCrawl = false, crawlEveryMs = 30 * DAY, crawlOptions = {}, maxAgeDays = 0, snapshotDetail = false, scoreResults = true, onProgress = () => {}, now = Date.now,
} = {}) {
  const roles = splitRoles(profile.roleSearch), roleFamilies = Array.isArray(profile.roleFamilies) ? profile.roleFamilies : [], locations = splitRoles(profile.locationSearch);
  const queryRoles = collectionRoleTerms(profile.roleSearch, roleFamilies, { rotation: Math.floor(now() / (5 * 60 * 1000)) });
  const stats = { discovered: 0, polled: 0, dead: 0, aggregatorPostings: 0, errors: {} };
  const snapshots = {};

  onProgress(10, 'Discovering job boards…');
  if (config.SEARXNG_URL && queryRoles.length) {
    try {
      const { boards } = await discoverSearx(http, config.SEARXNG_URL, buildQueries(queryRoles, locations, { rotation: Math.floor(now() / (5 * 60 * 1000)) }));
      stats.discovered += (await registry.add(boards, 'searxng')).length;
    } catch (error) { stats.errors.searxng = error.message; }
  }
  if (commonCrawl) {
    const last = (await registry.meta('commoncrawl')).lastRunAt || 0;
    if (now() - last >= crawlEveryMs) {
      try {
        const { index, boards } = await discoverCommonCrawl(http, crawlOptions);
        stats.discovered += (await registry.add(boards, 'commoncrawl')).length;
        await registry.setMeta('commoncrawl', { lastRunAt: now(), index, boards: boards.length });
      } catch (error) { stats.errors.commoncrawl = error.message; }
    }
  }

  onProgress(25, 'Reading free job aggregators…');
  let aggregated = [];
  if (aggregators.length) {
    const agg = await collectAggregators({ http, config, roles: queryRoles, locations, registry, now }, { enabled: aggregators.filter(a => AGGREGATORS[a]) });
    Object.assign(stats.errors, agg.errors);
    stats.discovered += (await registry.add(agg.boards, 'aggregator')).length;
    aggregated = agg.postings.map(p => normalizePosting(p, { canFill })).filter(Boolean);
    stats.aggregatorPostings = aggregated.length;
    const eligible = aggregated.filter(p => (!roles.length && !roleFamilies.length) || matchesRoleTargets(p.title, profile.roleSearch, roleFamilies))
      .filter(p => withinAge(p.postedAt, maxAgeDays, now()) && locationMatches(p, locations) && !ruleFilter(p, rules));
    if (eligible.length) await onPostings(eligible, { source: 'aggregator' });
  }

  onProgress(40, 'Polling due employer boards…');
  let due = await registry.due({ limit: maxBoardsPerRun });
  if (!due.length && typeof registry.leastRecentlyPolled === 'function') {
    due = await registry.leastRecentlyPolled({ limit: Math.min(80, maxBoardsPerRun) });
  }
  const polled = await mapPool(due, boardConcurrency, async (record, i) => {
    const out = await pollBoard(registry, record, { http, roles: queryRoles, targetRoles: roles, roleFamilies, canFill, snapshotDetail });
    const eligible = out.postings.filter(p => withinAge(p.postedAt, maxAgeDays, now()) && locationMatches(p, locations) && !ruleFilter(p, rules));
    if (eligible.length) await onPostings(eligible, { source: 'ats', board: record.key });
    if (i % 20 === 0) onProgress(40 + Math.min(30, Math.floor((i / Math.max(1, due.length)) * 30)), `Polled ${i + 1} of ${due.length} boards…`);
    return out;
  });
  await registry.flush();
  stats.polled = due.length;
  stats.dead = polled.filter(p => p.result.status === 'dead').length;
  const snapshotAt = new Date(now()).toISOString();
  polled.forEach((p, i) => { if (p.openIds && p.result.status !== 'dead') snapshots[due[i].key] = { ids: p.openIds, at: snapshotAt, ...(p.openItems ? { items: p.openItems } : {}) }; });
  let direct = polled.flatMap(p => p.postings);

  // Link harvesting: boards referenced by anything we just collected join the registry for the next cycle.
  stats.discovered += (await registry.add(harvestFromPostings([...direct, ...aggregated]), 'harvest')).length;

  onProgress(75, 'Filtering and scoring matches…');
  // Aggregator copies only matter when they fit the roles; direct ATS copies win on duplicates.
  const aggregatedMatches = aggregated.filter(p => (!roles.length && !roleFamilies.length) || matchesRoleTargets(p.title, profile.roleSearch, roleFamilies));
  stats.directPostings = direct.length; stats.aggregatorMatches = aggregatedMatches.length; stats.beforeDedupe = direct.length + aggregatedMatches.length;
  let postings = dedupePostings([...direct, ...aggregatedMatches]);
  stats.afterDedupe = postings.length;
  postings = postings.filter(p => withinAge(p.postedAt, maxAgeDays, now()) && locationMatches(p, locations) && !ruleFilter(p, rules));
  const results = scoreResults
    ? await scorePostings(postings, { profileText: profile.skills || profile.headline || profile.masterResumeText || profile.resumeText || '', roles, roleFamilies, embed })
    : postings.map(posting => ({ posting }));
  if (scoreResults) results.sort((a, b) => Number(b.posting.canFill) - Number(a.posting.canFill) || b.score - a.score);
  stats.kept = results.length;
  return { postings: results, stats, snapshots };
}

/** Map a scored posting to the Daymark job record used by the feed, auto-apply and the UI. */
export function toDaymarkJob({ posting: p, score, why }, nowIso = new Date().toISOString()) {
  return {
    id: jobIdOf(p), sourceId: p.sourceId, board: p.board || '', company: p.company, role: p.title,
    location: p.locations.join(' · ') || (p.remoteType === 'remote' ? 'Remote' : 'Location not listed'),
    posted: p.postedAt, source: p.ats ? `${p.ats} board` : p.source, salary: p.salary?.text || '', tags: p.tags.slice(0, 5),
    url: p.applyUrl, description: p.description, logoUrl: p.logoUrl || '', match: score, matchWhy: why,
    ats: p.ats, discoverySource: p.source || '', sourceUrl: p.sourceUrl || '', applyMode: p.applyMode, remoteType: p.remoteType, seniority: p.seniority, yearsExperience: p.yearsExperience,
    sponsorship: p.sponsorship, clearance: p.clearance, roleFamilies: roleFamiliesForTitle(p.title), dedupeKey: p.dedupeKey, first_seen_at: nowIso, last_seen_at: nowIso,
  };
}

export function hydrateMissingDescription(job, description, nowIso = new Date().toISOString()) {
  const text = String(description ?? '').trim();
  if (!job || String(job.description ?? '').trim() || !text) return false;
  job.description = text.slice(0, 28_000);
  job.updatedAt = nowIso;
  return true;
}

/** Drop scored postings already in the feed (same apply URL or same title/company/location). */
export function withoutExistingJobs(scored, existingJobs) {
  const urls = new Set(existingJobs.map(j => canonicalUrl(j.url))), keys = new Set(existingJobs.map(j => j.dedupeKey || dedupeKey({ company: j.company, title: j.role, locations: String(j.location || '').split(' · ') })));
  return scored.filter(({ posting }) => !urls.has(posting.applyUrl) && !keys.has(posting.dedupeKey));
}
