import { toIso } from '../schema.mjs';
export const id = 'bamboohr';
export const boardUrl = b => `https://${encodeURIComponent(board.token ?? b.token)}.bamboohr.com/careers/list`;

export async function fetchBoard(board, { http }) {
  const data = await http.json(`https://${encodeURIComponent(board.token)}.bamboohr.com/careers/list`);
  const list = Array.isArray(data?.result) ? data.result : (Array.isArray(data) ? data : []);
  return list.map(j => ({
    ats: id,
    board: board.token,
    source: id,
    sourceId: String(j.id ?? ''),
    title: j.jobOpeningName || j.title,
    company: board.company || board.token,
    locations: [[j.location?.city, j.location?.state, j.location?.country].filter(Boolean).join(', ')].filter(Boolean),
    remote: j.isRemote === 'yes' || j.isRemote === true || j.locationType === '1' ? true : undefined,
    description: j.description || j.departmentLabel || '',
    applyUrl: `https://${encodeURIComponent(board.token)}.bamboohr.com/careers/${encodeURIComponent(j.id)}`,
    postedAt: toIso(j.datePosted || j.createdAt),
    tags: [j.departmentLabel, j.employmentStatusLabel].filter(Boolean),
  }));
}
