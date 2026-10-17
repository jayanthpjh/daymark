import { toIso } from '../schema.mjs';
export const id = 'workable';
export const boardUrl = b => `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(b.token)}/jobs`;
export async function fetchBoard(board, { http, wantDetail = () => false, maxPages = 10 }) {
  const out = [];
  let token, complete = false;
  for (let page = 0; page < maxPages; page++) {
    const data = await http.json(boardUrl(board), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [], ...(token ? { token } : {}) }) });
    for (const j of data.results ?? []) {
      out.push({
        ats: id, board: board.token, source: id, sourceId: j.shortcode, title: j.title, company: board.company || board.token,
        locations: [[j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(', ')].filter(Boolean),
        remote: j.remote, workplaceType: j.workplace, applyUrl: `https://apply.workable.com/${encodeURIComponent(board.token)}/j/${j.shortcode}/`,
        postedAt: toIso(j.published || j.published_on), tags: [].concat(j.department ?? []).filter(Boolean), description: j.description || '',
      });
    }
    token = data.nextPage;
    if (!token || !data.results?.length) { complete = true; break; }
  }
  if (!complete) out.truncated = true; // the page cap stopped us before the end of the list
  for (const p of out) {
    if (p.description || !wantDetail(p)) continue;
    try {
      const d = await http.json(`https://apply.workable.com/api/v2/accounts/${encodeURIComponent(board.token)}/jobs/${encodeURIComponent(p.sourceId)}`);
      p.description = [d.description, d.requirements, d.benefits].filter(Boolean).join('\n');
    } catch { /* keep list-level data */ }
  }
  return out;
}
