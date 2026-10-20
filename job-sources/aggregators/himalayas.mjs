import { toIso } from '../schema.mjs';

export const id = 'himalayas';
// The provider refreshes its data daily; more frequent polling cannot yield newer source data.
export const minIntervalMs = 24 * 60 * 60 * 1000;

export async function fetchPostings({ http, roles = [] }) {
  const queries = roles.length ? roles.slice(0, 6) : [''];
  const out = [];
  for (const query of queries) {
    const params = new URLSearchParams({ country: 'US', sort: 'recent', page: '1' });
    if (query) params.set('q', query);
    const data = await http.json(`https://himalayas.app/jobs/api/search?${params}`);
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    for (const job of jobs) {
      const applyUrl = job.applicationLink;
      if (!applyUrl || !job.title) continue;
      out.push({
        source: id,
        sourceId: job.guid,
        sourceUrl: 'https://himalayas.app/jobs',
        title: job.title,
        company: job.companyName,
        locations: job.locationRestrictions?.length ? job.locationRestrictions : ['Remote'],
        remote: true,
        description: job.description || job.excerpt || '',
        applyUrl,
        postedAt: toIso(job.pubDate),
        tags: [...(job.categories ?? []), job.employmentType].filter(Boolean),
        salary: job.minSalary || job.maxSalary ? {
          min: job.minSalary, max: job.maxSalary, currency: job.currency || null,
          period: ({ annual: 'year', yearly: 'year', hourly: 'hour', monthly: 'month', weekly: 'week', fortnightly: 'fortnight' })[String(job.salaryPeriod || 'annual').toLowerCase()] || 'year',
        } : null,
      });
    }
  }
  return out;
}
