// Isolated trial of job pulling. Runs the real collection pipeline against a throwaway registry and writes a report.
// It never writes Daymark state: no jobs, tasks or applications. state.json is only read (for your saved roles) and
// is checksummed before and after so the report can prove it did not change.
//
//   node scripts/job-sources-trial.mjs --pass 1
//   node scripts/job-sources-trial.mjs --pass 2 --roles "data engineer, analytics engineer" --locations "United States, Remote"
//   node scripts/job-sources-trial.mjs --pass 3 --searxng http://127.0.0.1:8888
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createHttp } from '../job-sources/http.mjs';
import { Registry, JsonFileStore } from '../job-sources/registry.mjs';
import { runCollection, defaultCanFill } from '../job-sources/collect.mjs';
import { checkOpen } from '../job-sources/open-check.mjs';
import { splitRoles } from '../job-sources/match.mjs';

export const PASSES = Object.freeze({
  1: { maxBoardsPerRun: 150, crawlPages: 2, aggregators: ['remotive', 'remoteok', 'arbeitnow', 'hn'] },
  2: { maxBoardsPerRun: 800, crawlPages: 5, aggregators: ['remotive', 'remoteok', 'arbeitnow', 'hn'] },
  3: { maxBoardsPerRun: 800, crawlPages: 5, aggregators: ['remotive', 'remoteok', 'arbeitnow', 'hn'] },
});
// Daymark spaces requests to a host 400 ms apart. A busy event loop can start one request late and the next on time, so the
// measured start-to-start gap can dip below 400 ms without the rate changing. The rate limit is therefore checked per second.
export const POLITE = Object.freeze({ maxConcurrent: 2, minGapMs: 400, maxPerSecond: 3, max429Share: 0.02 });

export function parseArgs(argv) {
  const out = { pass: 1, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--pass') out.pass = Number(next());
    else if (a === '--roles') out.roles = next();
    else if (a === '--locations') out.locations = next();
    else if (a === '--searxng') out.searxng = next();
    else if (a === '--state') out.state = next();
    else if (a === '--out') out.out = next();
    else if (a === '--max-age') out.maxAgeDays = Number(next());
    else if (a === '--persist') out.persist = true;
    else if (a === '--resume') { out.persist = true; out.resume = true; }
    else if (a === '--keep') out.keep = true;
    else throw new Error(`Unknown option ${a}`);
  }
  if (![1, 2, 3].includes(out.pass)) throw new Error('--pass must be 1, 2 or 3');
  if (out.pass === 3 && !out.searxng) throw new Error('Pass 3 needs --searxng http://127.0.0.1:8888');
  if (out.searxng) { const u = new URL(out.searxng); if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('The trial only talks to a SearXNG on this machine.'); }
  return out;
}

/** Wraps a fetch so every request is measured where it leaves the process (after Daymark's own throttling). */
export function instrumentFetch(baseFetch, { now = Date.now } = {}) {
  const hosts = new Map();
  const slot = host => { let h = hosts.get(host); if (!h) hosts.set(host, h = { requests: 0, statuses: {}, errors: 0, active: 0, peakActive: 0, lastStart: 0, minGapMs: Infinity, totalMs: 0, starts: [] }); return h; };
  const fetchFn = async (url, options) => {
    const host = new URL(url).host, h = slot(host), start = now();
    h.starts.push(start); if (h.starts.length > 5000) h.starts.shift();
    if (h.lastStart) h.minGapMs = Math.min(h.minGapMs, start - h.lastStart);
    h.lastStart = start; h.requests++; h.active++; h.peakActive = Math.max(h.peakActive, h.active);
    try {
      const response = await baseFetch(url, options);
      h.statuses[response.status] = (h.statuses[response.status] || 0) + 1;
      return response;
    } catch (error) { h.errors++; throw error; }
    finally { h.active--; h.totalMs += now() - start; }
  };
  return { fetch: fetchFn, snapshot: () => Object.fromEntries([...hosts].map(([host, h]) => [host, { requests: h.requests, statuses: h.statuses, errors: h.errors, peakActive: h.peakActive, minGapMs: h.minGapMs === Infinity ? null : h.minGapMs, maxPerSecond: maxInWindow(h.starts, 1000), avgMs: h.requests ? Math.round(h.totalMs / h.requests) : 0 }])) };
}

// Most request starts inside any window of `ms` (starts are in time order).
export function maxInWindow(starts, ms) { let best = 0, lo = 0; for (let hi = 0; hi < starts.length; hi++) { while (starts[hi] - starts[lo] >= ms) lo++; best = Math.max(best, hi - lo + 1); } return best; }
const count = (items, key) => items.reduce((acc, item) => { const k = key(item) || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
// How old the kept postings are, and how many boards gave a complete listing (the ones that can later show a job was taken down).
export function freshnessOf(postings, snapshots, now) {
  const ages = postings.map(p => Date.parse(p.postedAt || '')).map(t => (Number.isFinite(t) ? Math.max(0, (now - t) / 86_400_000) : null));
  const dated = ages.filter(a => a != null);
  const bucket = (lo, hi) => dated.filter(a => a >= lo && a < hi).length;
  return { dated: dated.length, undated: ages.length - dated.length, under7: bucket(0, 7), under30: bucket(7, 30), under90: bucket(30, 90), older: bucket(90, Infinity),
    snapshotBoards: Object.keys(snapshots).length, snapshotJobs: Object.values(snapshots).reduce((n, snap) => n + (snap.ids?.length || 0), 0) };
}
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/** Turns the raw run into numbers. Pure, so it is unit-tested. */
export function buildReport({ params, stats, records, scored, hosts, durationMs, stateBefore, stateAfter, snapshots = {}, now = Date.now() }) {
  const postings = scored.map(s => s.posting);
  const polled = records.filter(r => r.lastPolledAt);
  const active = polled.filter(r => r.status === 'active' || r.status === 'parked').length;
  const dead = polled.filter(r => r.status === 'dead').length;
  const totalRequests = Object.values(hosts).reduce((n, h) => n + h.requests, 0);
  const total429 = Object.values(hosts).reduce((n, h) => n + (h.statuses[429] || 0), 0);
  const filled = postings.filter(p => p.canFill).length;
  const scores = scored.map(s => s.score).sort((a, b) => a - b);
  const at = q => (scores.length ? scores[Math.min(scores.length - 1, Math.floor(q * scores.length))] : null);
  return {
    params, durationMs,
    boards: { known: records.length, bySource: count(records, r => r.discoveredVia), byAts: count(records, r => r.ats), polled: polled.length, active, dead, activeShare: pct(active, active + dead) },
    postings: { fromBoards: stats.directPostings ?? 0, fromAggregators: stats.aggregatorMatches ?? stats.aggregatorPostings ?? 0, beforeDedupe: stats.beforeDedupe ?? 0, afterDedupe: stats.afterDedupe ?? 0, duplicatesRemoved: Math.max(0, (stats.beforeDedupe ?? 0) - (stats.afterDedupe ?? 0)), kept: scored.length, keptByAts: count(postings, p => p.ats || 'aggregator-only'), canFill: filled, canFillShare: pct(filled, postings.length) },
    freshness: freshnessOf(postings, snapshots, now),
    scores: { min: scores[0] ?? null, p25: at(0.25), median: at(0.5), p75: at(0.75), max: scores.at(-1) ?? null },
    http: { totalRequests, total429, share429: pct(total429, totalRequests), hosts },
    errors: stats.errors || {},
    top: scored.slice(0, 20).map(s => ({ company: s.posting.company, title: s.posting.title, ats: s.posting.ats || '', score: s.score, canFill: Boolean(s.posting.canFill), location: s.posting.locations?.join(' · ') || s.posting.remoteType || '', url: s.posting.applyUrl, why: s.why?.[0] || '' })),
    state: { checksumBefore: stateBefore, checksumAfter: stateAfter, unchanged: stateBefore === stateAfter },
  };
}

/** The acceptance bar from the plan. `pending` checks need a person. */
export function evaluateBar(report) {
  const checks = [];
  const atsContributing = Object.entries(report.postings.keptByAts).filter(([k, n]) => k !== 'aggregator-only' && n > 0).length;
  checks.push({ id: 'ats-types', label: 'At least 3 ATS types contribute postings', ok: atsContributing >= 3, detail: `${atsContributing} contributing` });
  checks.push({ id: 'boards-active', label: 'A clear majority of polled boards are active', ok: report.boards.polled > 0 && report.boards.activeShare >= 60, detail: `${report.boards.activeShare}% of ${report.boards.active + report.boards.dead} verified` });
  const hostList = Object.entries(report.http.hosts);
  const tooBusy = hostList.filter(([, h]) => h.peakActive > POLITE.maxConcurrent).map(([host]) => host);
  const tooFast = hostList.filter(([, h]) => (h.maxPerSecond ?? 0) > POLITE.maxPerSecond).map(([host]) => host);
  checks.push({ id: 'concurrency', label: `No host sees more than ${POLITE.maxConcurrent} requests at once`, ok: tooBusy.length === 0, detail: tooBusy.length ? tooBusy.join(', ') : 'all within the limit' });
  checks.push({ id: 'spacing', label: `No host receives more than ${POLITE.maxPerSecond} requests in any one second`, ok: tooFast.length === 0, detail: tooFast.length ? tooFast.join(', ') : `busiest host: ${Math.max(0, ...hostList.map(([, h]) => h.maxPerSecond ?? 0))} per second` });
  checks.push({ id: 'throttling', label: 'Fewer than 2% of requests were throttled (429)', ok: report.http.share429 < POLITE.max429Share * 100, detail: `${report.http.share429}% (${report.http.total429} of ${report.http.totalRequests})` });
  checks.push({ id: 'dedupe', label: 'Duplicates are removed and counted', ok: report.postings.beforeDedupe >= report.postings.afterDedupe, detail: `${report.postings.duplicatesRemoved} removed` });
  checks.push({ id: 'fillable', label: 'A majority of kept postings can be filled automatically', ok: report.postings.kept > 0 && report.postings.canFillShare > 50, detail: `${report.postings.canFillShare}% of ${report.postings.kept}` });
  checks.push({ id: 'state', label: 'Daymark state was not changed', ok: report.state.unchanged, detail: report.state.checksumBefore ? 'checksum identical' : 'no state file read' });
  checks.push({ id: 'spot-check', label: 'You judge at least 14 of 20 sample postings as a fit', ok: null, detail: 'pending: your review of the top 20' });
  return checks;
}

export function renderMarkdown(report, checks) {
  const row = (...cells) => `| ${cells.join(' | ')} |`;
  const lines = [`# Job pulling trial, pass ${report.params.pass}`, '', `Roles: ${report.params.roles.join(', ') || '(none)'}. Locations: ${report.params.locations.join(', ') || '(any)'}. Took ${Math.round(report.durationMs / 1000)} s.`, '',
    '## Acceptance bar', '', ...checks.map(c => `- ${c.ok === true ? 'PASS' : c.ok === false ? 'FAIL' : 'PENDING'}: ${c.label} (${c.detail})`), '',
    '## Boards', '', `Known ${report.boards.known}, polled ${report.boards.polled}, active ${report.boards.active}, dead ${report.boards.dead}.`, '',
    `By discovery source: ${JSON.stringify(report.boards.bySource)}`, '', `By ATS: ${JSON.stringify(report.boards.byAts)}`, '',
    '## Postings', '', `From boards ${report.postings.fromBoards}, from aggregators ${report.postings.fromAggregators}. Before de-duplication ${report.postings.beforeDedupe}, after ${report.postings.afterDedupe} (${report.postings.duplicatesRemoved} removed). Kept after location and skip rules: ${report.postings.kept}.`, '',
    `Kept by ATS: ${JSON.stringify(report.postings.keptByAts)}. Auto-fillable: ${report.postings.canFill} (${report.postings.canFillShare}%).`, '',
    `Scores: min ${report.scores.min}, p25 ${report.scores.p25}, median ${report.scores.median}, p75 ${report.scores.p75}, max ${report.scores.max}.`, '',
    '## Freshness', '', `Dated ${report.freshness.dated}, undated ${report.freshness.undated}. Posted under 7 days ago: ${report.freshness.under7}; 7 to 30 days: ${report.freshness.under30}; 30 to 90 days: ${report.freshness.under90}; older: ${report.freshness.older}.`, '', `${report.freshness.snapshotBoards} boards gave a complete listing (${report.freshness.snapshotJobs} open jobs), so a job missing from them twice in a row would be marked closed.`, '',
    ...(report.comparison ? ['## Compared with the previous run', '', report.comparison.previousAt ? `Previous run ${report.comparison.previousAt}. ${report.comparison.boardsCompared} boards were listed in both runs: ${report.comparison.jobsBefore} jobs before, ${report.comparison.stillListed} still listed, ${report.comparison.missing} no longer listed, ${report.comparison.newlyListed} newly listed.` : 'First persisted run: nothing to compare with yet.', '', ...(report.comparison.verified?.length ? ['Spot-check of vanished jobs against the employer site:', ...report.comparison.verified.map(v => `- ${v.company} / ${v.title}: ${v.answer} (${v.url})`), ''] : [])] : []),
    '## Requests', '', `${report.http.totalRequests} requests, ${report.http.total429} throttled (${report.http.share429}%).`, '',
    row('Host', 'Requests', 'Statuses', 'Errors', 'Peak at once', 'Max per second', 'Avg ms'), row('---', '---', '---', '---', '---', '---', '---'),
    ...Object.entries(report.http.hosts).sort((a, b) => b[1].requests - a[1].requests).slice(0, 25).map(([host, h]) => row(host, h.requests, JSON.stringify(h.statuses), h.errors, h.peakActive, h.maxPerSecond ?? '', h.avgMs)), '',
    '## Source errors', '', Object.keys(report.errors).length ? Object.entries(report.errors).map(([k, v]) => `- ${k}: ${v}`).join('\n') : 'None.', '',
    '## Top 20 postings (judge fit yourself)', '', row('#', 'Company', 'Title', 'ATS', 'Score', 'Fill', 'Location'), row('---', '---', '---', '---', '---', '---', '---'),
    ...report.top.map((t, i) => row(i + 1, t.company, t.title, t.ats || '-', t.score, t.canFill ? 'auto' : 'manual', t.location)), ''];
  return lines.join('\n');
}

/** Compares this run's complete board listings with the previous run's. Pure. */
export function compareSnapshots(previous, current, { sample = 5 } = {}) {
  const out = { previousAt: previous?.at || null, boardsCompared: 0, jobsBefore: 0, stillListed: 0, missing: 0, newlyListed: 0, sampleMissing: [] };
  if (!previous?.boards) return out;
  for (const [key, before] of Object.entries(previous.boards)) {
    const now = current[key];
    if (!now) continue;
    out.boardsCompared++;
    const nowIds = new Set(now.ids), beforeIds = new Set(before.ids);
    out.jobsBefore += before.ids.length;
    for (const id of before.ids) {
      if (nowIds.has(id)) out.stillListed++;
      else { out.missing++; const item = (before.items || []).find(x => x.id === id); if (out.sampleMissing.length < sample && item) out.sampleMissing.push({ board: key, ...item }); }
    }
    for (const id of now.ids) if (!beforeIds.has(id)) out.newlyListed++;
  }
  return out;
}

const checksum = async file => { try { return createHash('sha256').update(await fs.readFile(file)).digest('hex'); } catch { return ''; } };

/** Runs one pass. Everything external is injectable so tests never touch the network. */
export async function runTrial({ pass = 1, maxAgeDays = 30, roles, locations, searxng, statePath, fetch = globalThis.fetch, now = Date.now, sleep, outDir, keep = false, persistDir, resume = false, verifyClosed = true, log = console.log } = {}) {
  const preset = PASSES[pass];
  let profile = {};
  const stateBefore = statePath ? await checksum(statePath) : '';
  if ((!roles || !locations) && statePath) { try { profile = JSON.parse(await fs.readFile(statePath, 'utf8')).profile || {}; } catch { /* no saved profile */ } }
  const roleList = splitRoles(roles ?? profile.roleSearch), locationList = splitRoles(locations ?? profile.locationSearch);
  if (!roleList.length) throw new Error('No roles to search for. Pass --roles "data engineer, analytics engineer" or save roles in your profile.');

  // --persist keeps the board registry and the listings between runs, so a later --resume run can show what disappeared.
  const temp = persistDir || await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-job-trial-'));
  if (persistDir) await fs.mkdir(persistDir, { recursive: true });
  const store = new JsonFileStore(path.join(temp, 'registry.json'));
  const registry = await new Registry(store).init();
  const snapshotFile = path.join(temp, 'snapshots.json');
  let previous = null;
  if (persistDir) { try { previous = JSON.parse(await fs.readFile(snapshotFile, 'utf8')); } catch { /* the first run has nothing to compare with */ } }
  if (resume) {
    if (!previous) throw new Error('Nothing to resume: run once with --persist first.');
    // Poll the boards from the last run again now, whatever their schedule says, and do not discover new ones.
    for (const record of await registry.all()) if (record.status !== 'dead') await store.put({ ...record, nextPollAt: 0 });
    await registry.flush();
  }
  const meter = instrumentFetch(fetch, { now });
  const http = createHttp({ fetch: meter.fetch, ...(sleep ? { sleep } : {}) });
  const started = now();
  try {
    const { postings, stats, snapshots } = await runCollection({
      registry, http, profile: { roleSearch: roleList.join(', '), locationSearch: locationList.join(', '), masterResumeText: profile.masterResumeText || profile.resumeText || '' },
      rules: {}, config: searxng ? { SEARXNG_URL: searxng } : {}, aggregators: resume ? [] : preset.aggregators, maxBoardsPerRun: preset.maxBoardsPerRun, snapshotDetail: Boolean(persistDir),
      commonCrawl: !resume, crawlOptions: { maxPages: preset.crawlPages }, maxAgeDays, canFill: defaultCanFill, onProgress: (v, m) => log(`${String(v).padStart(3)}%  ${m}`), now,
    });
    const records = await registry.all();
    const stateAfter = statePath ? await checksum(statePath) : '';
    const report = buildReport({ params: { pass, roles: roleList, locations: locationList, ...preset, searxng: Boolean(searxng) }, stats, records, scored: postings, hosts: meter.snapshot(), durationMs: now() - started, stateBefore, stateAfter, snapshots, now: now() });
    const checks = evaluateBar(report);
    if (persistDir) {
      report.comparison = compareSnapshots(previous, snapshots);
      if (resume && verifyClosed) {
        // Ask the employer's own site about a few of the jobs that vanished from their listing.
        report.comparison.verified = [];
        for (const item of report.comparison.sampleMissing) report.comparison.verified.push({ ...item, answer: (await checkOpen({ url: item.url }, { http })).status });
      }
      await fs.writeFile(snapshotFile, JSON.stringify({ at: new Date(now()).toISOString(), boards: snapshots }));
    }
    if (outDir) {
      await fs.mkdir(outDir, { recursive: true });
      const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(path.join(outDir, `pass-${pass}-${stamp}.json`), JSON.stringify({ report, checks }, null, 2));
      await fs.writeFile(path.join(outDir, `pass-${pass}-${stamp}.md`), renderMarkdown(report, checks));
    }
    return { report, checks, tempRegistry: keep || persistDir ? temp : null };
  } finally {
    if (!keep && !persistDir) await fs.rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
  const dataDir = process.env.DAYMARK_DATA_DIR || path.join(root, 'data');
  const { report, checks, tempRegistry } = await runTrial({ pass: args.pass, persistDir: args.persist ? path.join(root, 'trial-output', 'persist') : undefined, resume: args.resume, maxAgeDays: args.maxAgeDays ?? 30, roles: args.roles, locations: args.locations, searxng: args.searxng, statePath: args.state || path.join(dataDir, 'state.json'), outDir: args.out || path.join(root, 'trial-output'), keep: args.keep });
  console.log('\n' + renderMarkdown(report, checks));
  if (tempRegistry) console.log(`Registry kept at ${tempRegistry}`);
  process.exitCode = checks.some(c => c.ok === false) ? 2 : 0;
}
