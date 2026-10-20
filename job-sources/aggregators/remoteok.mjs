import { toIso } from '../schema.mjs';
export const id = 'remoteok';
export async function fetchPostings({ http }) {
  const data = await http.json('https://remoteok.com/api');
  return (Array.isArray(data) ? data : []).filter(j => j && j.position).map(j => ({
    source: id, sourceId: j.id, sourceUrl: j.url || 'https://remoteok.com/remote-jobs', title: j.position, company: j.company, locations: [j.location].filter(Boolean), remote: true,
    description: j.description, applyUrl: j.apply_url || j.url, postedAt: toIso(j.date), tags: j.tags ?? [],
    salary: j.salary_min || j.salary_max ? { min: j.salary_min, max: j.salary_max, currency: 'USD', period: 'year' } : null,
  }));
}
