// Finds a company's logo on demand, with no list of companies. The company's own website is found from its name (and from
// links in its job posting), checked to really be that company, and its icon is saved on disk so each company is looked up once.
// Nothing about you or your search is sent anywhere: only the company's own public pages are requested, and only from this machine.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const POSITIVE_TTL_MS = 30 * 86_400_000;
export const NEGATIVE_TTL_MS = 3 * 86_400_000;
const MAX_ICON_BYTES = 300_000, MAX_HTML_BYTES = 400_000, MAX_CANDIDATES = 8;
const SUFFIX = /\b(?:company|co|corporation|corp|incorporated|inc|llc|l\.l\.c|lp|llp|ltd|limited|plc|gmbh|ag|sa|se|kg|holdings?|group|the)\b\.?/gi;
const SKIP_HOSTS = /(^|\.)(linkedin|facebook|twitter|x|instagram|youtube|github|medium|wikipedia|glassdoor|indeed|google|apple|amazon|greenhouse|lever|ashbyhq|workable|workday|myworkdayjobs|smartrecruiters|recruitee|icims|avature|successfactors|jobvite|bamboohr|breezy|notion|calendly|zoom|bit|goo)\.(com|co|io|me|ly|gl|us|net)$/i;
const TLDS = ['com', 'io', 'ai', 'co', 'net', 'org'];

export const slugFor = company => String(company ?? '').toLowerCase().replace(/^\d+\s+(?=[a-z])/, '').replace(SUFFIX, ' ').replace(/[^a-z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ');
const keyFor = company => createHash('sha256').update(slugFor(company) || String(company)).digest('hex').slice(0, 24);

/** Websites worth trying for a company, best first: links found in its posting that look like it, then name-based guesses. */
export function candidateDomains(company, hintUrls = []) {
  const slug = slugFor(company);
  if (!slug || slug.length < 2) return [];
  const squashed = slug.replace(/ /g, ''), first = slug.split(' ')[0];
  const out = [];
  const add = host => { host = String(host).toLowerCase().replace(/^www\./, ''); if (host && host.includes('.') && !SKIP_HOSTS.test(host) && !out.includes(host)) out.push(host); };
  for (const raw of hintUrls) {
    try { const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); const label = host.split('.').slice(-2, -1)[0] || ''; if (label.includes(squashed) || squashed.includes(label) && label.length >= 4 || label === first) add(host.split('.').slice(-2).join('.')); } catch { /* not a URL */ }
  }
  const words = slug.split(' ');
  add(`${squashed}.com`);
  if (words.length > 2) add(`${words.slice(0, 2).join('')}.com`);   // "Booz Allen Hamilton" -> boozallen.com
  if (words.length > 1) add(`${words.join('-')}.com`);
  for (const tld of TLDS.slice(1)) add(`${squashed}.${tld}`);
  if (first !== squashed && first.length >= 5) add(`${first}.com`);
  return out.slice(0, MAX_CANDIDATES);
}

const attr = (tag, name) => (new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag) || []).slice(2).find(Boolean) || '';
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');

/** Does this page belong to the company? The name (or its first word, if long enough) must show in the title or site name. */
export function pageMatchesCompany(html, company) {
  const slug = slugFor(company);
  if (!slug) return false;
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '';
  const site = (html.match(/<meta[^>]+>/gi) || []).filter(t => /og:site_name|application-name/i.test(t)).map(t => attr(t, 'content')).join(' ');
  const haystack = `${title} ${site}`.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
  const squash = value => value.replace(/ /g, '');
  const words = slug.split(' '), first = words[0];
  // A long name is often shortened on its own site ("Booz Allen Hamilton" -> "Booz Allen"), so its first two words count too.
  const lead = words.length > 2 ? words.slice(0, 2).join(' ') : '';
  return (lead && haystack.includes(lead)) || haystack.includes(slug) || squash(haystack).includes(squash(slug)) || (first.length >= 5 && haystack.split(' ').includes(first));
}

/** Icon links from a page, best first: Apple touch icons and SVGs, then larger PNGs, then any icon, then /favicon.ico. */
export function iconCandidates(html, baseUrl) {
  const found = [];
  for (const tag of html.match(/<link[^>]+>/gi) || []) {
    const rel = attr(tag, 'rel').toLowerCase(), href = attr(tag, 'href');
    if (!href || !/\bicon\b|apple-touch-icon/.test(rel) || /mask-icon/.test(rel)) continue;
    const size = Math.max(0, ...((attr(tag, 'sizes').match(/\d+/g) || []).map(Number)));
    const kind = attr(tag, 'type').toLowerCase();
    const score = (rel.includes('apple-touch') ? 400 : 0) + (kind.includes('svg') || /\.svg(\?|$)/i.test(href) ? 350 : 0) + Math.min(size, 512) / 2 + (/\.png(\?|$)/i.test(href) ? 20 : 0);
    try { found.push({ url: new URL(href, baseUrl).href, score }); } catch { /* bad href */ }
  }
  found.sort((a, b) => b.score - a.score);
  const urls = found.map(f => f.url);
  try { urls.push(new URL('/favicon.ico', baseUrl).href); } catch { /* ignore */ }
  return [...new Set(urls)].slice(0, 5);
}

/** Recognizes an image by its first bytes. Anything else is rejected, whatever the server says it is. */
export function sniffImage(buffer) {
  const b = buffer;
  if (b.length < 8) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.toString('latin1', 0, 3) === 'GIF') return 'image/gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  const head = b.toString('utf8', 0, 600).trimStart().toLowerCase();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?(<!doctype svg[^>]*>\s*)?<svg[\s>]/.test(head) || head.includes('<svg')) return 'image/svg+xml';
  return null;
}

// Images over the limit are refused. Pages over the limit are cut off: the title and icon links are at the top.
async function readLimited(response, limit, { truncate = false } = {}) {
  const reader = response.body?.getReader?.();
  if (!reader) { const buf = Buffer.from(await response.arrayBuffer()); return buf.length > limit ? (truncate ? buf.subarray(0, limit) : null) : buf; }
  const chunks = []; let total = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > limit) { await reader.cancel().catch(() => {}); if (!truncate) return null; chunks.push(value); break; } chunks.push(value); }
  const all = Buffer.concat(chunks);
  return truncate ? all.subarray(0, limit) : all;
}

export function createLogoResolver({ dir, fetch = globalThis.fetch, validateUrl = async raw => new URL(raw), now = Date.now, timeoutMs = 7000, concurrency = 3, budgetMs = 20_000 } = {}) {
  const inflight = new Map(); let active = 0; const waiting = [];
  const slot = async () => { if (active >= concurrency) await new Promise(resolve => waiting.push(resolve)); active++; };
  const free = () => { active--; waiting.shift()?.(); };

  // Follows redirects by hand so every hop is checked as a public address before it is requested.
  async function get(raw, accept, limit, options = {}) {
    let url = raw;
    for (let hop = 0; hop < 4; hop++) {
      const checked = await validateUrl(url);
      const response = await fetch(checked.href, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { accept, 'user-agent': 'DaymarkLocal/0.1 (company logo lookup)' } });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) { await response.body?.cancel?.().catch(() => {}); url = new URL(response.headers.get('location'), checked.href).href; continue; }
      if (!response.ok) { await response.body?.cancel?.().catch(() => {}); return null; }
      const body = await readLimited(response, limit, options);
      return body ? { body, url: checked.href, type: response.headers.get('content-type') || '' } : null;
    }
    return null;
  }

  async function findOnline(company, hints) {
    const started = Date.now();   // one company never takes longer than the budget, however many sites are slow
    for (const domain of candidateDomains(company, hints)) {
      if (Date.now() - started > budgetMs) break;
      try {
        const page = await get(`https://${domain}/`, 'text/html', MAX_HTML_BYTES, { truncate: true });
        if (!page || !/html/i.test(page.type)) continue;
        const html = page.body.toString('utf8');
        if (!pageMatchesCompany(html, company)) continue;
        for (const iconUrl of iconCandidates(html, page.url)) {
          if (Date.now() - started > budgetMs * 1.5) break;
          try {
            const icon = await get(iconUrl, 'image/*', MAX_ICON_BYTES);
            const type = icon && sniffImage(icon.body);
            if (type) return { bytes: icon.body, type, domain, source: iconUrl };
          } catch { /* try the next icon */ }
        }
      } catch { /* try the next domain */ }
    }
    return null;
  }

  async function lookup(company, hints) {
    const key = keyFor(company), meta = path.join(dir, `${key}.json`), file = path.join(dir, `${key}.img`);
    try {
      const saved = JSON.parse(await fs.readFile(meta, 'utf8'));
      const age = now() - saved.checkedAt;
      if (saved.found && age < POSITIVE_TTL_MS) return { found: true, type: saved.type, file, domain: saved.domain };
      if (!saved.found && age < NEGATIVE_TTL_MS) return { found: false };
    } catch { /* never looked up */ }
    await slot();
    try {
      const hit = await findOnline(company, hints);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      if (hit) { await fs.writeFile(file, hit.bytes, { mode: 0o600 }); await fs.writeFile(meta, JSON.stringify({ found: true, type: hit.type, domain: hit.domain, checkedAt: now() })); return { found: true, type: hit.type, file, domain: hit.domain }; }
      await fs.writeFile(meta, JSON.stringify({ found: false, checkedAt: now() }));
      return { found: false };
    } finally { free(); }
  }

  return {
    /** Resolves to {found, type, file, domain}. Several asks for the same company share one lookup. */
    resolve(company, hints = []) {
      const key = keyFor(company);
      if (!slugFor(company)) return Promise.resolve({ found: false });
      if (!inflight.has(key)) inflight.set(key, lookup(company, hints).finally(() => inflight.delete(key)));
      return inflight.get(key);
    },
  };
}
