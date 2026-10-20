import { toIso } from '../schema.mjs';
export const id = 'pinpoint';
export const boardUrl = b => `https://${encodeURIComponent(b.token)}.pinpointhq.com/postings.json`;

export async function fetchBoard(board, { http }) {
  const raw = await http.json(boardUrl(board));
  const list = Array.isArray(raw) ? raw : (raw.data ?? raw.postings ?? []);
  return list.map(j => ({
    ats: id,
    board: board.token,
    source: id,
    sourceId: String(j.id ?? ''),
    title: j.title,
    company: j.company?.name || board.company || board.token,
    locations: [j.location?.name, j.location?.city].filter(Boolean),
    remote: Boolean(j.workplace_type === 'remote' || /remote/i.test(String(j.workplace_type_text || ''))),
    workplaceType: j.workplace_type_text || j.workplace_type,
    description: [j.description, j.key_responsibilities, j.skills_knowledge_expertise].filter(Boolean).join('\n\n'),
    applyUrl: j.url || `https://${encodeURIComponent(board.token)}.pinpointhq.com/postings/${encodeURIComponent(j.id)}`,
    postedAt: toIso(j.created_at || j.published_at || j.updated_at),
    salary: j.compensation_minimum || j.compensation_maximum
      ? { min: Number(j.compensation_minimum) || null, max: Number(j.compensation_maximum) || null, currency: j.compensation_currency || 'USD', period: /hour/i.test(String(j.compensation_frequency || '')) ? 'hour' : 'year' }
      : null,
    tags: [j.job_Requisition?.department?.name, j.employment_type_text].filter(Boolean),
  }));
}
