import { toIso } from '../schema.mjs';
export const id = 'breezy';
export const boardUrl = b => `https://${encodeURIComponent(b.token)}.breezy.hr/json`;

export async function fetchBoard(board, { http }) {
  const data = await http.json(boardUrl(board));
  return (Array.isArray(data) ? data : []).map(j => ({
    ats: id,
    board: board.token,
    source: id,
    sourceId: String(j.id || j.friendly_id || ''),
    title: j.name || j.title,
    company: j.company?.name || board.company || board.token,
    locations: [j.location?.name, [j.location?.city, j.location?.state?.id, j.location?.country?.id].filter(Boolean).join(', ')].filter(Boolean),
    remote: Boolean(j.location?.is_remote),
    description: j.description || '',
    applyUrl: j.url || `https://${encodeURIComponent(board.token)}.breezy.hr/p/${encodeURIComponent(j.friendly_id || j.id)}`,
    postedAt: toIso(j.published_date || j.creation_date),
    tags: [j.department, j.type?.name].filter(Boolean),
  }));
}
