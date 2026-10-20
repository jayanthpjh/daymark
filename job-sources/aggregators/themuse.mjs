import { toIso } from '../schema.mjs';
export const id = 'themuse';
export const needsKey = config => !config.MUSE_API_KEY;
export async function fetchPostings({ http, config = {}, pages = 2 }) {
  const out = [];
  for (let page = 0; page < pages; page++) {
    const q = new URLSearchParams({ page: String(page), ...(config.MUSE_API_KEY ? { api_key: config.MUSE_API_KEY } : {}) });
    const data = await http.json(`https://www.themuse.com/api/public/jobs?${q}`);
    for (const j of data.results ?? []) out.push({
      source: id, sourceId: j.id, sourceUrl: j.refs?.landing_page, title: j.name, company: j.company?.name, locations: (j.locations ?? []).map(l => l.name),
      description: j.contents, applyUrl: j.refs?.landing_page, postedAt: toIso(j.publication_date), tags: (j.categories ?? []).map(c => c.name),
      workplaceType: (j.locations ?? []).some(l => /flexible|remote/i.test(l.name)) ? 'remote' : undefined,
    });
    if (page + 1 >= (data.page_count ?? 1)) break;
  }
  return out;
}
