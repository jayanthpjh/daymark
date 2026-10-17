import { toIso } from '../schema.mjs';
export const id = 'recruitee';
export const boardUrl = b => `https://${encodeURIComponent(b.token)}.recruitee.com/api/offers/`;
export async function fetchBoard(board, { http }) {
  const data = await http.json(boardUrl(board));
  return (data.offers ?? []).filter(o => !o.status || o.status === 'published').map(o => ({
    ats: id, board: board.token, source: id, sourceId: o.id, title: o.title, company: o.company_name || board.token,
    locations: [[o.city, o.country].filter(Boolean).join(', ')].filter(Boolean), remote: o.remote || o.on_site === false ? true : undefined,
    description: [o.description, o.requirements].filter(Boolean).join('\n'), applyUrl: o.careers_url || o.careers_apply_url,
    postedAt: toIso(o.published_at || o.created_at), tags: [o.department].filter(Boolean),
    salary: o.salary?.min || o.salary?.max ? { min: Number(o.salary.min) || null, max: Number(o.salary.max) || null, currency: o.salary.currency, period: o.salary.period === 'hour' ? 'hour' : 'year' } : null,
  }));
}
