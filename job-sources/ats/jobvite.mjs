import { toIso } from '../schema.mjs';
export const id = 'jobvite';
export const boardUrl = b => `https://jobs.jobvite.com/${encodeURIComponent(b.token)}/jobs`;

export async function fetchBoard(board, { http }) {
  const url = boardUrl(board);
  if (typeof http.htmlAllowed === 'function' && !(await http.htmlAllowed(url))) return [];
  if (typeof http.htmlAllowed !== 'function' && typeof http.robotsAllows === 'function' && !(await http.robotsAllows(url))) return [];
  const text = await http.text(url, { redirect: 'manual', headers: { accept: 'application/json, text/html' } });
  try {
    const json = JSON.parse(text);
    const list = Array.isArray(json) ? json : (json.jobs ?? json.reqList ?? []);
    return list.map(j => ({
      ats: id,
      board: board.token,
      source: id,
      sourceId: String(j.id ?? j.eId ?? ''),
      title: j.title,
      company: j.company || board.company || board.token,
      locations: [j.location].filter(Boolean),
      remote: /remote/i.test(String(j.location || '')) ? true : undefined,
      description: j.description || '',
      applyUrl: j.applyUrl || j.detailUrl || `https://jobs.jobvite.com/${encodeURIComponent(board.token)}/job/${encodeURIComponent(j.id || j.eId)}`,
      postedAt: toIso(j.date || j.postedAt),
      tags: [j.category, j.department].filter(Boolean),
    }));
  } catch {
    const out = [];
    const linkRe = new RegExp(`<a[^>]+href=["']((?:https://jobs\\.jobvite\\.com)?/${board.token}/job/([a-zA-Z0-9_-]+))["'][^>]*>([\\s\\S]*?)</a>`, 'gi');
    for (const m of text.matchAll(linkRe)) {
      const title = m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      out.push({
        ats: id,
        board: board.token,
        source: id,
        sourceId: m[2],
        title,
        company: board.company || board.token,
        locations: [],
        description: '',
        applyUrl: m[1].startsWith('http') ? m[1] : `https://jobs.jobvite.com${m[1]}`,
        postedAt: '',
        tags: [],
      });
    }
    return out;
  }
}
