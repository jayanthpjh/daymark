import { toIso, htmlToText } from '../schema.mjs';
export const id = 'hn';
const URL_RE = /https?:\/\/[^\s"'<>)]+/g;
const decodeHref = html => [...String(html).matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&#x2F;/g, '/').replace(/&amp;/g, '&'));

/** Latest "Ask HN: Who is hiring?" thread via Algolia; each top-level comment is one posting. */
export async function fetchPostings({ http, maxComments = 400 }) {
  const search = await http.json('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10');
  const story = (search.hits ?? []).find(h => /who is hiring/i.test(h.title ?? ''));
  if (!story) return [];
  const thread = await http.json(`https://hn.algolia.com/api/v1/items/${story.objectID}`);
  const out = [];
  for (const c of (thread.children ?? []).slice(0, maxComments)) {
    if (!c.text) continue;
    const text = htmlToText(c.text), head = text.split('\n')[0];
    const links = [...new Set([...decodeHref(c.text), ...(text.match(URL_RE) ?? [])])];
    const [company, ...rest] = head.split('|').map(s => s.trim());
    const title = rest.find(s => /engineer|developer|scientist|analyst|manager|designer|architect|product|data|ml|devops|sre/i.test(s)) || rest[1] || rest[0];
    if (!title || !company || company.length > 80) continue;
    out.push({
      source: id, sourceId: c.id, sourceUrl: `https://news.ycombinator.com/item?id=${c.id}`, title, company, locations: rest.filter(s => /remote|onsite|hybrid|,|[A-Z]{2}\b/.test(s) && s !== title).slice(0, 2),
      remote: /\bremote\b/i.test(head) || undefined, description: text, applyUrl: links[0] || `https://news.ycombinator.com/item?id=${c.id}`, links, postedAt: toIso(c.created_at),
    });
  }
  return out;
}
