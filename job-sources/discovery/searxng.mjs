// Daily role-targeted discovery through a self-hosted SearXNG instance (URL is configurable).
import { parseBoardUrl, boardKey } from '../schema.mjs';

export const SITE_PATTERNS = ['jobs.lever.co', 'boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.ashbyhq.com', 'myworkdayjobs.com', 'jobs.smartrecruiters.com', 'apply.workable.com', 'recruitee.com'];

export function buildQueries(roles, locations = [], { sites = SITE_PATTERNS, maxQueries = 60 } = {}) {
  const queries = [];
  for (const role of roles) for (const site of sites) {
    queries.push(`site:${site} "${role}"`);
    for (const loc of locations.slice(0, 3)) queries.push(`site:${site} "${role}" ${loc}`);
  }
  return queries.slice(0, maxQueries);
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
