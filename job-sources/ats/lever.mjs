import { toIso } from '../schema.mjs';
export const id = 'lever';
export const boardUrl = b => `https://api.${b.host === 'eu' ? 'eu.' : ''}lever.co/v0/postings/${encodeURIComponent(b.token)}?mode=json`;
export async function fetchBoard(board, { http }) {
  const data = await http.json(boardUrl(board));
  return (Array.isArray(data) ? data : []).map(j => ({
    ats: id, board: board.token, source: id, sourceId: j.id, title: j.text, company: board.company || board.token,
    locations: [j.categories?.location, ...(j.categories?.allLocations ?? [])].filter(Boolean),
    workplaceType: j.workplaceType, description: j.descriptionPlain || j.description,
    applyUrl: j.hostedUrl || j.applyUrl, postedAt: toIso(j.createdAt),
    salary: j.salaryRange ? { min: j.salaryRange.min, max: j.salaryRange.max, currency: j.salaryRange.currency, period: /hour/i.test(j.salaryRange.interval) ? 'hour' : 'year' } : null,
    tags: [j.categories?.team, j.categories?.commitment].filter(Boolean),
  }));
}
