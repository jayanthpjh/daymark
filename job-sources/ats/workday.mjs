import { toIso } from '../schema.mjs';
export const id = 'workday';
// Workday is queried with the person's role terms, so its list is a search result, not the whole board. It cannot show that a job is gone.
export const snapshot = 'partial';
// Board token is "tenant/wdN/site"; Workday CXS answers POSTs on the tenant's own host.
export function parts(board) {
  const [tenant, wd, site] = String(board.token).split('/');
  return { tenant, site, host: board.host || `${tenant}.${wd}.myworkdayjobs.com` };
}
export const boardUrl = b => { const p = parts(b); return `https://${p.host}/wday/cxs/${p.tenant}/${p.site}/jobs`; };
function postedOn(text) {
  const t = String(text ?? '').toLowerCase(), days = t.includes('today') ? 0 : t.includes('yesterday') ? 1 : Number(t.match(/(\d+)\+?\s*days?/)?.[1]);
  return Number.isFinite(days) ? toIso(Date.now() - days * 86_400_000) : '';
}
// `searchText` narrows a large tenant to the user's roles; each term is queried separately and merged.
export async function fetchBoard(board, { http, searchTerms = [''], wantDetail = () => false, maxPages = 10 }) {
  const p = parts(board), seen = new Map();
  for (const term of searchTerms.length ? searchTerms : ['']) {
    for (let page = 0; page < maxPages; page++) {
      const data = await http.json(boardUrl(board), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: page * 20, searchText: term }) });
      for (const j of data.jobPostings ?? []) {
        if (!j.externalPath || seen.has(j.externalPath)) continue;
        seen.set(j.externalPath, {
          ats: id, board: board.token, source: id, sourceId: j.bulletFields?.[0] || j.externalPath, title: j.title, company: board.company || p.tenant,
          locations: [j.locationsText].filter(Boolean), applyUrl: `https://${p.host}/${p.site}${j.externalPath}`,
          postedAt: postedOn(j.postedOn), description: '', _path: j.externalPath,
        });
      }
      if (!data.jobPostings?.length || (page + 1) * 20 >= (data.total ?? 0)) break;
    }
  }
  const out = [...seen.values()];
  for (const j of out) {
    if (!wantDetail(j)) { delete j._path; continue; }
    try {
      const d = await http.json(`https://${p.host}/wday/cxs/${p.tenant}/${p.site}${j._path}`);
      const info = d.jobPostingInfo ?? {};
      j.description = info.jobDescription || '';
      j.postedAt = toIso(info.startDate) || j.postedAt;
      j.remote = /remote/i.test(info.remoteType ?? '') ? true : undefined;
      if (info.additionalLocations?.length) j.locations.push(...info.additionalLocations);
    } catch { /* keep list-level data */ }
    delete j._path;
  }
  return out;
}
