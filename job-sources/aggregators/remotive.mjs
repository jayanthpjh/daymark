import { toIso, parseSalaryText } from '../schema.mjs';
export const id = 'remotive';
export async function fetchPostings({ http, roles = [] }) {
  const out = [];
  for (const search of roles.length ? roles.slice(0, 6) : ['']) {
    const data = await http.json(`https://remotive.com/api/remote-jobs?${new URLSearchParams(search ? { search } : {})}`);
    for (const j of data.jobs ?? []) out.push({
      source: id, sourceId: j.id, sourceUrl: j.url, title: j.title, company: j.company_name, locations: [j.candidate_required_location].filter(Boolean), remote: true,
      description: j.description, applyUrl: j.url, postedAt: toIso(j.publication_date), tags: [j.category, ...(j.tags ?? [])].filter(Boolean),
      salary: parseSalaryText(j.salary) || (j.salary ? { text: j.salary } : null),
    });
  }
  return out;
}
