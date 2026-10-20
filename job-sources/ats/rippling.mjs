import { toIso } from '../schema.mjs';
export const id = 'rippling';
export const boardUrl = b => `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(b.token)}/jobs`;

export const jobDetailUrl = (board, jobId) => `${boardUrl(board)}/${encodeURIComponent(jobId)}`;

export function ripplingPostingIdentity(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname.toLowerCase() !== 'ats.rippling.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const jobsIndex = parts.indexOf('jobs');
    if ((jobsIndex !== 1 && jobsIndex !== 2) || !parts[jobsIndex - 1] || !parts[jobsIndex + 1]) return null;
    return { board: decodeURIComponent(parts[jobsIndex - 1]).toLowerCase(), jobId: decodeURIComponent(parts[jobsIndex + 1]).toLowerCase() };
  } catch { return null; }
}

export function findRipplingDuplicate(jobs, identity) {
  if (!identity) return null;
  return jobs.find(item => {
    if (item.ats !== 'rippling') return false;
    if (String(item.board || '').toLowerCase() === identity.board && String(item.sourceId || '').toLowerCase() === identity.jobId) return true;
    const saved = ripplingPostingIdentity(item.url);
    return saved?.board === identity.board && saved?.jobId === identity.jobId;
  }) || null;
}

export function ripplingDescription(detail) {
  const value = detail?.description ?? detail?.jobDescription ?? detail?.body ?? detail?.job?.description ?? detail?.job?.jobDescription ?? '';
  return typeof value === 'string' ? value : '';
}

export async function fetchJobDescription(board, jobId, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(jobDetailUrl({ token: board }, jobId), { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Rippling job details unavailable (${response.status}).`);
  return ripplingDescription(await response.json());
}

export async function fetchBoard(board, { http, wantDetail = () => false }) {
  const data = await http.json(boardUrl(board));
  const list = Array.isArray(data) ? data : (data.jobs ?? data.results ?? []);
  const postings = list.map(j => {
    const jobId = j.uuid || j.id || j.slug;
    const loc = j.workLocation?.label || j.workLocations?.[0] || [j.location?.city, j.location?.state, j.location?.country].filter(Boolean).join(', ') || (typeof j.location === 'string' ? j.location : '');
    return {
      ats: id,
      board: board.token,
      source: id,
      sourceId: String(jobId ?? ''),
      title: j.name || j.title,
      company: j.companyName || board.company || board.token,
      locations: [loc].filter(Boolean),
      remote: /remote/i.test(String(j.workplaceType || loc)) ? true : undefined,
      workplaceType: j.workplaceType,
      description: j.description || j.body || '',
      applyUrl: j.url || `https://ats.rippling.com/${encodeURIComponent(board.token)}/jobs/${encodeURIComponent(jobId)}`,
      postedAt: toIso(j.createdAt || j.publishedAt || j.updatedAt),
      tags: [j.department?.name || j.department].filter(Boolean),
    };
  });
  for (const posting of postings) {
    if (posting.description || !posting.sourceId || !wantDetail(posting)) continue;
    try { posting.description = ripplingDescription(await http.json(jobDetailUrl(board, posting.sourceId))); }
    catch { /* keep the public board listing if its detail endpoint is unavailable */ }
  }
  return postings;
}
