import { countryName } from '../geo.mjs';
import { toIso } from '../schema.mjs';
export const id = 'smartrecruiters';
const base = b => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.token)}/postings`;
export const boardUrl = b => `${base(b)}?limit=100`;
// The list endpoint has no description. `wantDetail(posting)` decides which postings are worth the extra request.
export async function fetchBoard(board, { http, wantDetail = () => false, maxPages = 10 }) {
  const out = [];
  let complete = false;
  for (let page = 0, offset = 0; page < maxPages; page++, offset += 100) {
    const data = await http.json(`${base(board)}?limit=100&offset=${offset}`);
    for (const j of data.content ?? []) {
      out.push({
        ats: id, board: board.token, source: id, sourceId: j.id, title: j.name, company: j.company?.name || board.token,
        locations: [[j.location?.city, j.location?.region, countryName(j.location?.country)].filter(Boolean).join(', ')].filter(Boolean),
        remote: j.location?.remote, applyUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(j.company?.identifier || board.token)}/${j.id}`,
        postedAt: toIso(j.releasedDate), tags: [j.department?.label, j.function?.label].filter(Boolean), description: '',
      });
    }
    if (!data.content?.length || offset + 100 >= (data.totalFound ?? 0)) { complete = true; break; }
  }
  if (!complete) out.truncated = true; // the page cap stopped us before the end of the list
  for (const p of out) {
    if (!wantDetail(p)) continue;
    try {
      const d = await http.json(`${base(board)}/${encodeURIComponent(p.sourceId)}`);
      const s = d.jobAd?.sections ?? {};
      p.description = [s.companyDescription, s.jobDescription, s.qualifications, s.additionalInformation].map(x => x?.text).filter(Boolean).join('\n\n');
      p.applyUrl = d.postingUrl ? d.postingUrl.split('?')[0] : p.applyUrl;
    } catch { /* keep list-level data */ }
  }
  return out;
}
