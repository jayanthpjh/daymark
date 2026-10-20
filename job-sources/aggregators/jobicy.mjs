import { toIso } from '../schema.mjs';

export const id = 'jobicy';
// Jobicy asks integrations not to start automated synchronization passes more often than hourly.
export const minIntervalMs = 60 * 60 * 1000;

export async function fetchPostings({ http, config = {} }) {
  const params = new URLSearchParams({ count: '200', geo: config.JOBICY_GEO || 'usa' });
  const data = await http.json(`https://jobicy.com/api/v2/remote-jobs?${params}`);
  if (data.success === false) throw new Error(data.error || 'Jobicy API request failed');
  return (data.jobs ?? []).filter(job => job?.url && job?.jobTitle).map(job => ({
    source: id,
    sourceId: job.id ?? job.jobSlug,
    sourceUrl: job.url,
    title: job.jobTitle,
    company: job.companyName,
    locations: [job.jobGeo].filter(Boolean),
    remote: true,
    description: job.jobDescription || job.jobExcerpt || '',
    applyUrl: job.url,
    postedAt: toIso(job.pubDate),
    tags: [...(job.jobIndustry ?? []), ...(job.jobType ?? []), job.jobLevel].filter(Boolean),
    salary: job.salaryMin || job.salaryMax ? {
      min: job.salaryMin, max: job.salaryMax, currency: job.salaryCurrency || null,
      period: ({ yearly: 'year', annual: 'year', hourly: 'hour', monthly: 'month' })[String(job.salaryPeriod || '').toLowerCase()] || 'year',
    } : null,
  }));
}
