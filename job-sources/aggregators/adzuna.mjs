import { toIso } from '../schema.mjs';
export const id = 'adzuna';
export const needsKey = cfg => !(cfg.ADZUNA_APP_ID && cfg.ADZUNA_APP_KEY);
export async function fetchPostings({ http, config, roles = [], locations = [], pages = 2 }) {
  if (needsKey(config)) return [];
  const country = (config.ADZUNA_COUNTRY || 'us').toLowerCase(), out = [];
  for (const what of roles.length ? roles.slice(0, 6) : ['']) for (let page = 1; page <= pages; page++) {
    const q = new URLSearchParams({ app_id: config.ADZUNA_APP_ID, app_key: config.ADZUNA_APP_KEY, results_per_page: '50', 'content-type': 'application/json', ...(what ? { what } : {}), ...(locations[0] ? { where: locations[0] } : {}) });
    const data = await http.json(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${q}`);
    for (const j of data.results ?? []) out.push({
      source: id, sourceId: j.id, title: j.title, company: j.company?.display_name, locations: [j.location?.display_name].filter(Boolean),
      description: j.description, applyUrl: j.redirect_url, postedAt: toIso(j.created), redirects: true,
      salary: j.salary_min || j.salary_max ? { min: j.salary_min, max: j.salary_max, currency: country === 'gb' ? 'GBP' : 'USD', period: 'year' } : null,
    });
    if (!(data.results ?? []).length) break;
  }
  return out;
}
