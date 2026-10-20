// Daily role-targeted discovery through a self-hosted SearXNG instance (URL is configurable).
import { parseBoardUrl, boardKey } from '../schema.mjs';

export const SITE_PATTERNS = [
  'jobs.lever.co',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.ashbyhq.com',
  'myworkdayjobs.com',
  'jobs.smartrecruiters.com',
  'apply.workable.com',
  'recruitee.com',
  'ats.rippling.com',
  'pinpointhq.com',
  'bamboohr.com/careers',
  'jobs.jobvite.com',
  'breezy.hr',
  'jobs.gem.com',
  'app.dover.com',
  'teamtailor.com',
  'applytojob.com',
  'jobs.personio.com',
  'comeet.com/jobs',
  'eightfold.ai',
  'icims.com',
  'avature.net',
  'jobs2web.com',
  'recruiting.ultipro.com',
  'workforcenow.adp.com',
  'taleo.net',
  'jobs.dayforcehcm.com',
  'recruiting.paylocity.com',
];

export function buildQueries(roles, locations = [], { sites = SITE_PATTERNS, maxQueries = 120, rotation = 0 } = {}) {
  const budget = Math.max(0, Math.floor(Number(maxQueries) || 0));
  if (!budget || !roles.length || !sites.length) return [];
  // Rotate through the complete role × ATS matrix, reserving up to a quarter of the
  // request budget for locations so those refinements are not sliced off at the end.
  const candidates = [];
  const siteOffset = ((rotation % sites.length) + sites.length) % sites.length;
  for (let i = 0; i < roles.length * sites.length; i++) {
    const role = roles[i % roles.length], site = sites[(siteOffset + Math.floor(i / roles.length)) % sites.length];
    candidates.push(`site:${site} "${role}"`);
  }
  const locationsToUse = locations.slice(0, 3);
  const reserve = locationsToUse.length ? Math.min(Math.floor(budget / 4), candidates.length * locationsToUse.length) : 0;
  const baseCount = Math.min(candidates.length, budget - reserve);
  const queries = candidates.slice(0, baseCount);
  for (let i = 0; i < reserve; i++) {
    const base = candidates[(i * candidates.length / reserve | 0) % candidates.length];
    const location = locationsToUse[i % locationsToUse.length];
    queries.push(`${base} ${location}`);
  }
  return queries;
}

export async function discoverSearx(http, baseUrl, queries, { pages = 1 } = {}) {
  if (!baseUrl) return { boards: [], urls: [] };
  const root = baseUrl.replace(/\/+$/, '');
  const boards = new Map(), urls = new Set();
  for (const q of queries) {
    for (let pageno = 1; pageno <= pages; pageno++) {
      let data;
      try { data = await http.json(`${root}/search?${new URLSearchParams({ q, format: 'json', pageno: String(pageno) })}`); }
      catch { break; } // an instance that blocks one query should not stop the run
      const results = data.results ?? [];
      for (const r of results) {
        const board = parseBoardUrl(r.url);
        if (!board) continue;
        boards.set(boardKey(board), { ats: board.ats, token: board.token, host: board.host });
        urls.add(r.url);
      }
      if (!results.length) break;
    }
  }
  return { boards: [...boards.values()], urls: [...urls] };
}
