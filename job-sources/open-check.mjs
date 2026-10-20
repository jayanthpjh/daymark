// Is this posting still open? Asked just before Daymark spends effort on it (tailoring, filling).
// Uses the employer ATS's own single-posting or listing endpoint, then a plain look at the apply URL.
// Answers 'open', 'closed' or 'unknown'. 'unknown' (a network problem, an ATS with no answer) never blocks anything.
import { parseBoardUrl } from './schema.mjs';
import { createHttp } from './http.mjs';

const GONE = new Set([404, 410]);
const answer = (status, via) => ({ status, via });

async function byStatus(http, url, via, init) {
  const response = await http.request(url, init);
  try { await response.body?.cancel?.(); } catch { /* the body is not needed */ }
  if (response.ok) return answer('open', via);
  if (GONE.has(response.status)) return answer('closed', via);
  return answer('unknown', via);
}
const inList = async (http, url, via, matches) => {
  const data = await http.json(url);
  return answer(matches(data) ? 'open' : 'closed', via);
};

const CHECKS = {
  greenhouse: (b, http) => b.jobId && byStatus(http, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}/jobs/${encodeURIComponent(b.jobId)}`, 'greenhouse'),
  lever: (b, http) => b.jobId && byStatus(http, `https://api.${b.host === 'eu' ? 'eu.' : ''}lever.co/v0/postings/${encodeURIComponent(b.token)}/${encodeURIComponent(b.jobId)}`, 'lever'),
  smartrecruiters: (b, http) => b.jobId && byStatus(http, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.token)}/postings/${encodeURIComponent(b.jobId)}`, 'smartrecruiters'),
  workable: (b, http) => b.jobId && byStatus(http, `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(b.token)}/jobs/${encodeURIComponent(b.jobId)}`, 'workable'),
  workday: (b, http) => b.jobId && byStatus(http, `https://${b.host}/wday/cxs/${b.tenant}/${b.site}/job/${b.jobId}`, 'workday'),
  // Ashby, Recruitee, Pinpoint, BambooHR, Breezy, and Rippling check the board list or job page status.
  ashby: (b, http) => b.jobId && inList(http, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.token)}`, 'ashby', d => (d.jobs ?? []).some(j => String(j.id) === b.jobId || String(j.jobUrl || '').includes(b.jobId))),
  recruitee: (b, http) => b.jobId && inList(http, `https://${encodeURIComponent(b.token)}.recruitee.com/api/offers/`, 'recruitee', d => (d.offers ?? []).some(o => String(o.slug) === b.jobId || String(o.careers_url || '').includes(`/o/${b.jobId}`))),
  pinpoint: (b, http) => b.jobId && inList(http, `https://${encodeURIComponent(b.token)}.pinpointhq.com/postings.json`, 'pinpoint', d => { const list = Array.isArray(d) ? d : (d.data ?? d.postings ?? []); return list.some(j => String(j.id) === b.jobId || String(j.url || '').includes(b.jobId)); }),
  bamboohr: (b, http) => b.jobId && inList(http, `https://${encodeURIComponent(b.token)}.bamboohr.com/careers/list`, 'bamboohr', d => (d.result ?? []).some(j => String(j.id) === b.jobId)),
  breezy: (b, http) => b.jobId && inList(http, `https://${encodeURIComponent(b.token)}.breezy.hr/json`, 'breezy', d => (Array.isArray(d) ? d : []).some(j => String(j.id) === b.jobId || String(j.friendly_id) === b.jobId)),
};

// Any other site: a missing page, or a redirect that lands on the board's front page, means the posting is gone.
async function probeUrl(http, url) {
  const response = await http.request(url, { method: 'GET', redirect: 'follow', headers: { accept: 'text/html' } });
  try { await response.body?.cancel?.(); } catch { /* not needed */ }
  if (GONE.has(response.status)) return answer('closed', 'page');
  const start = new URL(url), end = new URL(response.url || url);
  const depth = u => u.pathname.split('/').filter(Boolean).length;
  if (response.ok && depth(start) > 1 && depth(end) <= 1) return answer('closed', 'page');
  return answer('unknown', 'page');
}

export async function checkOpen(job, { http = createHttp() } = {}) {
  const url = job?.url;
  if (!url) return answer('unknown', 'none');
  try {
    const board = parseBoardUrl(url);
    const check = board && CHECKS[board.ats];
    if (check) { const result = await check(board, http); if (result) return result; }
    return await probeUrl(http, url);
  } catch {
    return answer('unknown', 'error');
  }
}
