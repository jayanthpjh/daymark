// Monthly board discovery from the free Common Crawl CDX index, by ATS URL shape.
import { parseBoardUrl, boardKey } from '../schema.mjs';

export const CDX_PATTERNS = [
  'boards.greenhouse.io/*', 'job-boards.greenhouse.io/*', 'job-boards.eu.greenhouse.io/*', 'jobs.lever.co/*', 'jobs.eu.lever.co/*',
  'jobs.ashbyhq.com/*', '*.myworkdayjobs.com/*', 'jobs.smartrecruiters.com/*', 'apply.workable.com/*', '*.recruitee.com/*',
];
const INDEX_LIST = 'https://index.commoncrawl.org/collinfo.json';

export async function latestIndex(http) {
  const list = await http.json(INDEX_LIST);
  const first = list.find(x => x['cdx-api']);
  if (!first) throw new Error('Common Crawl returned no index collections.');
  return { id: first.id, api: first['cdx-api'] };
}

/**
 * Which CDX pages to read. The index is sorted by URL, so reading only the first pages finds only companies starting with
 * digits and "a". With a known page count, pages are spread evenly across the whole index (shifted by `offset` so each run
 * sees different ones); without it, pages are probed at growing distances and ones past the end simply answer 400 or 404.
 */
export function pagePlan(numPages, maxPages, offset = 0) {
  if (Number.isInteger(numPages) && numPages > 0) {
    if (numPages <= maxPages) return Array.from({ length: numPages }, (_, i) => i);
    const step = numPages / maxPages;
    return Array.from({ length: maxPages }, (_, i) => Math.min(numPages - 1, i === 0 ? 0 : Math.floor(i * step + (offset % Math.max(1, Math.floor(step))))));
  }
  const probes = [0, ...[3, 12, 40, 120, 350, 900, 2500, 6000].map(n => n + (offset % 3))];
  return [...new Set(probes)].slice(0, maxPages);
}

async function pageCount(http, api, pattern) {
  try {
    const q = new URLSearchParams({ url: pattern, output: 'json', showNumPages: 'true' });
    const body = await http.text(`${api}?${q}`, { headers: { accept: 'application/json' } });
    const n = Number(JSON.parse(body).pages);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch { return null; }
}

/** Yields boards found for one URL pattern. Reads at most maxPages CDX pages, spread across the index. */
export async function discoverPattern(http, api, pattern, { maxPages = 5, maxBoards = 20_000, offset = 0 } = {}) {
  const boards = new Map();
  const plan = pagePlan(await pageCount(http, api, pattern), maxPages, offset);
  for (const page of plan) {
    if (boards.size >= maxBoards) break;
    const q = new URLSearchParams({ url: pattern, output: 'json', fl: 'url', filter: '=status:200', collapse: 'urlkey', page: String(page) });
    let body;
    try { body = await http.text(`${api}?${q}`, { headers: { accept: 'application/json' } }); }
    catch (error) { if (error.status === 404 || error.status === 400) continue; throw error; } // past the last page: try the next one
    for (const line of body.split('\n').filter(Boolean)) {
      let url; try { url = JSON.parse(line).url; } catch { continue; }
      const board = parseBoardUrl(url);
      if (board) boards.set(boardKey(board), { ats: board.ats, token: board.token, host: board.host });
    }
  }
  return [...boards.values()];
}

export async function discoverCommonCrawl(http, { patterns = CDX_PATTERNS, offset = Math.floor(Date.now() / 86_400_000), ...opts } = {}) {
  const { api, id } = await latestIndex(http);
  const found = new Map();
  for (const pattern of patterns) {
    try { for (const b of await discoverPattern(http, api, pattern, { ...opts, offset })) found.set(boardKey(b), b); }
    catch { /* one pattern failing must not stop the others */ }
  }
  return { index: id, boards: [...found.values()] };
}
