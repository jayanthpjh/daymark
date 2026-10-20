// Free aggregators. A result that links to a known ATS is resolved to the direct posting, so autofill works;
// every ATS board seen in any result is harvested into the registry.
import * as adzuna from './adzuna.mjs';
import * as usajobs from './usajobs.mjs';
import * as themuse from './themuse.mjs';
import * as remotive from './remotive.mjs';
import * as remoteok from './remoteok.mjs';
import * as arbeitnow from './arbeitnow.mjs';
import * as hn from './hn.mjs';
import * as jobicy from './jobicy.mjs';
import * as himalayas from './himalayas.mjs';
import { parseBoardUrl, harvestBoards, boardKey } from '../schema.mjs';

export const AGGREGATORS = Object.freeze({ adzuna, usajobs, themuse, remotive, remoteok, arbeitnow, hn, jobicy, himalayas });
const REDIRECTORS = /(^|\.)(adzuna\.[a-z.]+|themuse\.com|remotive\.com|remoteok\.com|arbeitnow\.com|click\.appcast\.io|jobs\.jobvite\.com)$/i;

/** Follow up to `hops` redirects (without downloading bodies) while still on an aggregator host. */
export async function resolveRedirect(http, url, hops = 4) {
  let current = url;
  for (let i = 0; i < hops; i++) {
    if (parseBoardUrl(current)) return current;
    let host; try { host = new URL(current).hostname; } catch { return current; }
    if (!REDIRECTORS.test(host)) return current;
    let response;
    try { response = await http.request(current, { method: 'GET', redirect: 'manual', headers: { accept: 'text/html' } }); } catch { return current; }
    const next = response.headers?.get?.('location');
    try { await response.body?.cancel?.(); } catch { /* ignore */ }
    if (!next || response.status < 300 || response.status >= 400) return current;
    current = new URL(next, current).href;
  }
  return current;
}

/**
 * Run the enabled aggregators. Returns { postings, boards }: raw postings whose applyUrl has been resolved
 * to a direct ATS URL where possible (with ats/board set), and every ATS board seen along the way.
 */
export async function collectAggregators(ctx, { enabled = Object.keys(AGGREGATORS), resolveLimit = 60 } = {}) {
  const raw = [], errors = {};
  for (const name of enabled) {
    const mod = AGGREGATORS[name];
    if (!mod) continue;
    if (mod.needsKey?.(ctx.config || {})) continue;
    const metadataKey = `aggregator:${name}`;
    const minimumInterval = Number(mod.minIntervalMs) || 0;
    if (minimumInterval && ctx.registry) {
      const lastAttempt = Number((await ctx.registry.meta(metadataKey)).lastAttemptAt) || 0;
      if ((ctx.now?.() ?? Date.now()) - lastAttempt < minimumInterval) continue;
      await ctx.registry.setMeta(metadataKey, { lastAttemptAt: ctx.now?.() ?? Date.now() });
    }
    try { raw.push(...await mod.fetchPostings(ctx)); } catch (error) { errors[name] = error.message; }
  }
  const boards = new Map(), postings = [];
  let resolves = 0;
  for (const p of raw) {
    let url = p.applyUrl;
    const sourceUrl = p.sourceUrl || p.applyUrl;
    if (!url) continue;
    if (p.redirects && !parseBoardUrl(url) && resolves < resolveLimit) { resolves++; url = await resolveRedirect(ctx.http, url); }
    let board = parseBoardUrl(url);
    if (!board) for (const link of p.links ?? []) { board = parseBoardUrl(link); if (board) { url = link; break; } }
    for (const b of [...harvestBoards(p.description), ...(p.links ?? []).map(parseBoardUrl).filter(Boolean), ...(parseBoardUrl(url) ? [parseBoardUrl(url)] : [])]) boards.set(boardKey(b), { ats: b.ats, token: b.token, host: b.host });
    postings.push({ ...p, sourceUrl, applyUrl: url, ats: board?.ats ?? null, board: board?.token ?? null, redirects: undefined, links: undefined });
  }
  return { postings, boards: [...boards.values()], errors };
}
