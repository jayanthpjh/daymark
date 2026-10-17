import { toIso } from '../schema.mjs';
export const id = 'ashby';
export const boardUrl = b => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.token)}?includeCompensation=true`;
export async function fetchBoard(board, { http }) {
  const data = await http.json(boardUrl(board));
  return (data.jobs ?? []).filter(j => j.isListed !== false).map(j => {
    const tier = j.compensation?.summaryComponents?.find(c => c.compensationType === 'Salary') ?? null;
    return {
      ats: id, board: board.token, source: id, sourceId: j.id, title: j.title, company: board.company || board.token,
      locations: [j.location, ...(j.secondaryLocations ?? []).map(l => l.location)].filter(Boolean),
      remote: j.isRemote, workplaceType: j.workplaceType, description: j.descriptionHtml || j.descriptionPlain,
      applyUrl: j.jobUrl || j.applyUrl, postedAt: toIso(j.publishedAt),
      salary: tier ? { min: tier.minValue, max: tier.maxValue, currency: tier.currencyCode, period: /hour/i.test(tier.interval) ? 'hour' : 'year', text: j.compensation?.compensationTierSummary } : (j.compensation?.compensationTierSummary ? { text: j.compensation.compensationTierSummary } : null),
      tags: [j.department, j.team].filter(Boolean),
    };
  });
}
