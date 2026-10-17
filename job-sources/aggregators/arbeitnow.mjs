import { toIso } from '../schema.mjs';
export const id = 'arbeitnow';
export async function fetchPostings({ http, pages = 2 }) {
  const out = [];
  let url = 'https://www.arbeitnow.com/api/job-board-api';
  for (let i = 0; i < pages && url; i++) {
    const data = await http.json(url);
    for (const j of data.data ?? []) out.push({
      source: id, sourceId: j.slug, title: j.title, company: j.company_name, locations: [j.location].filter(Boolean), remote: j.remote || undefined,
      description: j.description, applyUrl: j.url, postedAt: toIso(j.created_at), tags: j.tags ?? [],
    });
    url = data.links?.next || '';
  }
  return out;
}
