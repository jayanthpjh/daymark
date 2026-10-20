import { toIso } from '../schema.mjs';
export const id = 'usajobs';
export async function fetchPostings({ http, config, roles = [], locations = [], pages = 1 }) {
  if (!config.USAJOBS_API_KEY || !config.USAJOBS_USER_AGENT) return [];
  const out = [];
  for (const keyword of roles.length ? roles.slice(0, 4) : ['']) for (let page = 1; page <= pages; page++) {
    const q = new URLSearchParams({ ResultsPerPage: '50', Page: String(page), ...(keyword ? { Keyword: keyword } : {}), ...(locations[0] ? { LocationName: locations[0] } : {}) });
    const data = await http.json(`https://data.usajobs.gov/api/search?${q}`, { headers: { host: 'data.usajobs.gov', 'user-agent': config.USAJOBS_USER_AGENT, 'authorization-key': config.USAJOBS_API_KEY } });
    for (const item of data.SearchResult?.SearchResultItems ?? []) {
      const d = item.MatchedObjectDescriptor ?? {}, pay = d.PositionRemuneration?.[0];
      out.push({
        source: id, sourceId: item.MatterhornObjectId, sourceUrl: d.PositionURI, title: d.PositionTitle, company: d.OrganizationName || d.DepartmentName,
        locations: [d.PositionLocationDisplay].filter(Boolean), applyUrl: d.ApplyURI?.[0] || d.PositionURI, postedAt: toIso(d.PublicationStartDate),
        description: [d.UserArea?.Details?.JobSummary, d.QualificationSummary].filter(Boolean).join('\n'),
        salary: pay ? { min: Number(pay.MinimumRange), max: Number(pay.MaximumRange), currency: 'USD', period: /hour/i.test(pay.Description ?? '') || pay.RateIntervalCode === 'PH' ? 'hour' : 'year' } : null,
      });
    }
    if (!(data.SearchResult?.SearchResultItems ?? []).length) break;
  }
  return out;
}
