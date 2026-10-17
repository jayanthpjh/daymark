// Continuous link harvesting: every ATS link found in postings, mail or aggregator text adds its board.
import { harvestBoards, parseBoardUrl, boardKey } from '../schema.mjs';

export function harvestFromTexts(texts) {
  const found = new Map();
  for (const text of texts) for (const b of harvestBoards(text)) found.set(boardKey(b), { ats: b.ats, token: b.token, host: b.host });
  return [...found.values()];
}
export function harvestFromPostings(postings) {
  const found = new Map();
  for (const p of postings) {
    for (const url of [p.applyUrl, ...(p.links ?? [])]) { const b = parseBoardUrl(url); if (b) found.set(boardKey(b), { ats: b.ats, token: b.token, host: b.host }); }
    for (const b of harvestBoards(p.description)) found.set(boardKey(b), { ats: b.ats, token: b.token, host: b.host });
  }
  return [...found.values()];
}
