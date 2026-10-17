import { toIso } from '../schema.mjs';
export const id = 'greenhouse';
export const boardUrl = b => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}/jobs?content=true`;
export async function fetchBoard(board, { http }) {
  const data = await http.json(boardUrl(board));
  // The jobs endpoint does not carry the company name; the board endpoint does. One extra request, only until a name is known.
  let company = data.meta?.name || board.company;
  if (!company && (data.jobs ?? []).length) {
    try { company = (await http.json(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.token)}`)).name; } catch { /* the token stays as the fallback name */ }
  }
  return (data.jobs ?? []).map(j => ({
    ats: id, board: board.token, source: id, sourceId: j.id, title: j.title, company: company || board.token,
    locations: [j.location?.name, ...(j.offices ?? []).map(o => o.location || o.name)].filter(Boolean),
    description: j.content, applyUrl: j.absolute_url, postedAt: toIso(j.first_published || j.updated_at),
    tags: (j.departments ?? []).map(d => d.name),
  }));
}
