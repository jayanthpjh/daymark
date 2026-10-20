// Normalized posting schema shared by every ATS module and aggregator, plus URL-shape board detection across 28 ATS platforms.
import { createHash } from 'node:crypto';
import { safeImageUrl } from '../job-metadata.mjs';

export const ATS_IDS = [
  'greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'workday', 'recruitee',
  'rippling', 'pinpoint', 'bamboohr', 'jobvite', 'breezy',
  'gem', 'dover', 'teamtailor', 'jazzhr', 'personio', 'comeet', 'eightfold',
  'icims', 'avature', 'successfactors', 'ukg', 'adp', 'taleo', 'dayforce', 'paylocity', 'paycom',
];

const decodeEntities = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
export function htmlToText(html, max = 28_000) {
  let s = String(html ?? '');
  if (/&lt;\/?[a-z][^&]*&gt;/i.test(s) && !/<[a-z][^>]*>/i.test(s)) s = decodeEntities(s); // Greenhouse escapes its HTML
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|li|h[1-6]|tr|ul|ol)>|<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function slugToName(slug) { return String(slug).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim(); }

// ---- URL shape → board ---------------------------------------------------------------------
// Returns { ats, token, host?, site?, jobId? } or null. `token` is unique within the ATS.
const RESERVED = new Set(['embed', 'api', 'v1', 'www', 'jobs', 'careers', 'static', 'assets', 'login', 'about', 'blog', 'help', 'support', 'sitemap.xml', 'robots.txt', 'favicon.ico', 'cdn', 'app', 'admin', 'status', 'docs', 'en-us', 'en-gb']);
const okToken = t => typeof t === 'string' && /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(t) && !RESERVED.has(t.toLowerCase());

export function parseBoardUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase(), parts = u.pathname.split('/').filter(Boolean);
  const first = parts[0];
  if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host) || host === 'boards-api.greenhouse.io') {
    let tok = first === 'v1' && parts[1] === 'boards' ? parts[2] : first;
    if (tok === 'embed') tok = u.searchParams.get('for') || undefined;
    if (!okToken(tok)) return null;
    const job = parts.find((p, i) => /^\d+$/.test(p) && parts[i - 1] === 'jobs') || u.searchParams.get('gh_jid') || undefined;
    return { ats: 'greenhouse', token: tok.toLowerCase(), jobId: job };
  }
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co' || host === 'api.lever.co' || host === 'api.eu.lever.co') {
    const tok = host.startsWith('api.') ? parts[2] : first;
    if (!okToken(tok)) return null;
    return { ats: 'lever', token: tok.toLowerCase(), host: host.includes('.eu.') ? 'eu' : undefined, jobId: host.startsWith('api.') ? undefined : parts[1] };
  }
  if (host === 'jobs.ashbyhq.com' || host === 'api.ashbyhq.com') {
    const tok = host.startsWith('api.') ? parts[2] : first;
    if (!okToken(tok)) return null;
    return { ats: 'ashby', token: decodeURIComponent(tok), jobId: host.startsWith('api.') ? undefined : parts[1] };
  }
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com' || host === 'api.smartrecruiters.com') {
    const tok = host.startsWith('api.') ? (parts[1] === 'companies' ? parts[2] : undefined) : first;
    if (!okToken(tok)) return null;
    return { ats: 'smartrecruiters', token: tok, jobId: host.startsWith('api.') ? undefined : parts[1]?.match(/^\d+/)?.[0] };
  }
  if (host === 'apply.workable.com') {
    const tok = first === 'api' ? parts[3] : first;
    if (!okToken(tok)) return null;
    return { ats: 'workable', token: tok.toLowerCase(), jobId: parts[1] === 'j' ? parts[2] : undefined };
  }
  const wd = host.match(/^([a-z0-9-]+)\.(wd\d+)(?:\.[a-z0-9-]+)?\.myworkdayjobs\.com$/);
  if (wd) {
    const tenant = wd[1];
    let rest = parts;
    if (rest[0] === 'wday' && rest[1] === 'cxs') rest = rest.slice(3);
    if (/^[a-z]{2}-[A-Z]{2}$/i.test(rest[0] || '')) rest = rest.slice(1);
    const site = rest[0];
    if (!site || /^(job|details|login|userhome)$/i.test(site)) return null;
    const jobPart = rest.indexOf('job');
    return { ats: 'workday', token: `${tenant}/${wd[2]}/${site}`, host, site, tenant, jobId: jobPart >= 0 ? rest.slice(jobPart + 1).join('/') : undefined };
  }
  const rec = host.match(/^([a-z0-9-]+)\.recruitee\.com$/);
  if (rec && !['www', 'app', 'api', 'support', 'jobs'].includes(rec[1])) return { ats: 'recruitee', token: rec[1], jobId: parts[0] === 'o' ? parts[1] : undefined };
  if (host === 'ats.rippling.com') {
    const localeOffset = /^[a-z]{2}-[a-z]{2}$/i.test(first || '') ? 1 : 0;
    const tok = parts[localeOffset];
    if (!okToken(tok)) return null;
    const jobIdx = parts.indexOf('jobs', localeOffset + 1);
    const jobId = jobIdx >= 0 && parts[jobIdx + 1] ? parts[jobIdx + 1] : undefined;
    return { ats: 'rippling', token: tok.toLowerCase(), jobId };
  }
  const pp = host.match(/^([a-z0-9-]+)\.pinpointhq\.com$/);
  if (pp && !['www', 'app', 'api', 'support'].includes(pp[1])) {
    const jobId = parts[0] === 'postings' && parts[1] ? parts[1] : (!parts[0]?.endsWith('.json') ? parts[0] : undefined);
    return { ats: 'pinpoint', token: pp[1].toLowerCase(), jobId };
  }
  const bamboo = host.match(/^([a-z0-9-]+)\.bamboohr\.com$/);
  if (bamboo && !['www', 'app', 'api', 'help'].includes(bamboo[1]) && (first === 'careers' || first === 'jobs')) {
    const jobId = parts[1] && parts[1] !== 'list' ? parts[1] : u.searchParams.get('id') || undefined;
    return { ats: 'bamboohr', token: bamboo[1].toLowerCase(), jobId };
  }
  if (host === 'jobs.jobvite.com') {
    if (!okToken(first)) return null;
    const jobId = parts[1] === 'job' && parts[2] ? parts[2] : undefined;
    return { ats: 'jobvite', token: first.toLowerCase(), jobId };
  }
  const breezy = host.match(/^([a-z0-9-]+)\.breezy\.hr$/);
  if (breezy && !['www', 'app', 'api', 'support'].includes(breezy[1])) {
    const jobId = parts[0] === 'p' && parts[1] ? parts[1] : undefined;
    return { ats: 'breezy', token: breezy[1].toLowerCase(), jobId };
  }
  if (host === 'jobs.gem.com' || host === 'api.gem.com') {
    const tok = host === 'api.gem.com' ? parts[2] : first;
    if (!okToken(tok)) return null;
    return { ats: 'gem', token: tok.toLowerCase(), jobId: host === 'jobs.gem.com' ? parts[1] : undefined };
  }
  if (host === 'app.dover.com' || host === 'jobs.dover.com') {
    const tok = first === 'apply' || first === 'jobs' ? parts[1] : first;
    if (!okToken(tok)) return null;
    return { ats: 'dover', token: tok.toLowerCase(), jobId: first === 'apply' ? parts[2] : parts[1] };
  }
  const tt = host.match(/^([a-z0-9-]+)\.teamtailor\.com$/);
  if (tt && !['www', 'app', 'api', 'support'].includes(tt[1])) {
    return { ats: 'teamtailor', token: tt[1].toLowerCase(), host, jobId: parts[0] === 'jobs' ? parts[1] : undefined };
  }
  const jazz = host.match(/^([a-z0-9-]+)\.applytojob\.com$/);
  if (jazz && !['www', 'app', 'api'].includes(jazz[1])) {
    return { ats: 'jazzhr', token: jazz[1].toLowerCase(), jobId: parts[0] === 'apply' ? parts[1] : undefined };
  }
  const pers = host.match(/^([a-z0-9-]+)\.jobs\.personio\.(de|com)$/);
  if (pers) {
    return { ats: 'personio', token: pers[1].toLowerCase(), host, jobId: parts[0] === 'job' ? parts[1] : undefined };
  }
  if (host === 'www.comeet.com' || host === 'comeet.com') {
    if (first === 'jobs' && okToken(parts[1])) {
      return { ats: 'comeet', token: parts[1].toLowerCase(), jobId: parts[3] || parts[2] };
    }
  }
  const ef = host.match(/^([a-z0-9-]+)\.eightfold\.ai$/);
  if (ef && !['www', 'app', 'api'].includes(ef[1])) {
    const jobIdx = parts.indexOf('job');
    return { ats: 'eightfold', token: ef[1].toLowerCase(), host, jobId: jobIdx >= 0 ? parts[jobIdx + 1] : u.searchParams.get('pid') || undefined };
  }
  const icims = host.match(/^([a-z0-9-]+)\.icims\.com$/);
  if (icims && !['www', 'api', 'login'].includes(icims[1])) {
    const jobIdx = parts.indexOf('jobs');
    return { ats: 'icims', token: icims[1].toLowerCase(), host, jobId: jobIdx >= 0 && parts[jobIdx + 1] !== 'search' ? parts[jobIdx + 1] : undefined };
  }
  const avature = host.match(/^([a-z0-9-]+)\.avature\.(net|com)$/);
  if (avature && !['www', 'api'].includes(avature[1])) {
    const detailIdx = parts.findIndex(p => /^jobdetail$/i.test(p));
    return { ats: 'avature', token: avature[1].toLowerCase(), host, jobId: detailIdx >= 0 ? parts[detailIdx + 1] : undefined };
  }
  const sf = host.match(/^([a-z0-9-]+)\.(jobs2web\.com|successfactors\.(com|eu|de|net))$/);
  if (sf && !['www', 'api', 'performancemanager'].includes(sf[1])) {
    const jobIdx = parts.indexOf('job');
    return { ats: 'successfactors', token: sf[1].toLowerCase(), host, jobId: jobIdx >= 0 ? parts.slice(jobIdx + 1).join('/') : undefined };
  }
  if (host === 'recruiting.ultipro.com' || host === 'recruiting2.ultipro.com') {
    if (okToken(first)) {
      return { ats: 'ukg', token: first, jobId: u.searchParams.get('opportunityId') || undefined };
    }
  }
  if (host === 'workforcenow.adp.com') {
    const cid = u.searchParams.get('cid');
    if (okToken(cid)) return { ats: 'adp', token: cid, jobId: u.searchParams.get('jobId') || undefined };
  }
  const taleo = host.match(/^([a-z0-9-]+)\.taleo\.net$/);
  if (taleo && !['www', 'api'].includes(taleo[1])) {
    return { ats: 'taleo', token: taleo[1].toLowerCase(), host, jobId: u.searchParams.get('job') || undefined };
  }
  if (host === 'jobs.dayforcehcm.com') {
    const localeOffset = /^[a-z]{2}-[a-z]{2}$/i.test(first || '') ? 1 : 0;
    const tok = parts[localeOffset];
    if (okToken(tok)) {
      const jobIdx = parts.indexOf('jobs', localeOffset + 1);
      return { ats: 'dayforce', token: tok.toLowerCase(), jobId: jobIdx >= 0 ? parts[jobIdx + 1] : undefined };
    }
  }
  if (host === 'recruiting.paylocity.com') {
    const allIdx = parts.findIndex(p => /^(all|list)$/i.test(p));
    const tok = allIdx >= 0 ? parts[allIdx + 1] : parts[2];
    if (okToken(tok)) {
      const detailsIdx = parts.findIndex(p => /^details$/i.test(p));
      return { ats: 'paylocity', token: tok, jobId: detailsIdx >= 0 ? parts[detailsIdx + 1] : undefined };
    }
  }
  if (host.endsWith('paycomonline.net')) {
    const ck = u.searchParams.get('clientkey');
    if (okToken(ck)) return { ats: 'paycom', token: ck, jobId: u.searchParams.get('job') || undefined };
  }
  return null;
}
export const boardKey = board => `${board.ats}:${String(board.token).toLowerCase()}`;
export function boardFromKey(key) { const i = key.indexOf(':'); return { ats: key.slice(0, i), token: key.slice(i + 1) }; }

// Find every ATS board referenced by free text or an HTML blob (aggregator descriptions, mail, search results).
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;
export function harvestBoards(text) {
  const found = new Map();
  for (const m of String(text ?? '').matchAll(URL_RE)) {
    const board = parseBoardUrl(m[0].replace(/[.,;]+$/, ''));
    if (board) found.set(boardKey(board), board);
  }
  return [...found.values()];
}

// ---- field inference -----------------------------------------------------------------------
export function inferSeniority(title) {
  const t = String(title).toLowerCase();
  if (/\b(intern|internship|co-?op|apprentice)\b/.test(t)) return 'intern';
  if (/\b(chief|vp|vice president|head of|director)\b/.test(t)) return 'director';
  if (/\b(principal|staff|distinguished|architect)\b/.test(t)) return 'staff';
  if (/\b(senior|sr\.?|lead|iii|iv)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|entry|graduate|new grad|associate|i)\b/.test(t) && !/\bii\b/.test(t)) return 'entry';
  if (/\bmanager\b/.test(t)) return 'manager';
  return 'mid';
}
export function inferYears(text) {
  const matches = [...String(text).matchAll(/(\d{1,2})\s*(?:\+|-\s*\d{1,2}|to\s*\d{1,2})?\s*\+?\s*years?(?:\s+of)?[^.\n]{0,40}?(?:experience|exp)/gi)].map(m => Number(m[1])).filter(n => n > 0 && n < 30);
  return matches.length ? Math.min(...matches) : null;
}
export function inferSponsorship(text) {
  const t = String(text).toLowerCase();
  if (/(unable|not (?:able|eligible|available)|cannot|can't|will not|won't|no)\s+(?:to\s+)?(?:offer\s+|provide\s+)?(?:visa\s+)?sponsor|without (?:the need for )?(?:visa )?sponsorship|must be authorized to work[^.]{0,60}without|do(?:es)? not (?:offer|provide) (?:visa )?sponsorship/.test(t)) return 'no';
  if (/(?:visa )?sponsorship (?:is )?(?:available|provided|offered)|will sponsor|can sponsor|we sponsor|sponsor (?:work )?visas?/.test(t)) return 'yes';
  return 'unknown';
}
export function inferClearance(text) {
  return /\b(security clearance|top secret|ts\/sci|secret clearance|public trust|clearance (?:is )?required|active (?:dod )?clearance)\b/i.test(text);
}
export function inferRemoteType({ remote, workplaceType, locations = [], text = '' } = {}) {
  const w = String(workplaceType ?? '').toLowerCase();
  if (w.includes('hybrid')) return 'hybrid';
  if (w.includes('remote')) return 'remote';
  if (w.includes('on') && w.includes('site')) return 'onsite';
  if (remote === true) return 'remote';
  const loc = locations.join(' ').toLowerCase();
  if (/\bremote\b/.test(loc)) return 'remote';
  if (/\bhybrid\b/.test(loc) || /\bhybrid\b/.test(text.slice(0, 600).toLowerCase())) return 'hybrid';
  return remote === false ? 'onsite' : 'unknown';
}
export function salaryText(s) {
  if (!s || (!s.min && !s.max)) return s?.text || '';
  const sym = { USD: '$', EUR: '€', GBP: '£' }[s.currency] || (s.currency ? `${s.currency} ` : '$');
  const k = n => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const unit = s.period && s.period !== 'year' ? `/${s.period}` : '';
  return s.min && s.max && s.min !== s.max ? `${sym}${k(s.min)}–${k(s.max)}${unit}` : `${sym}${k(s.min || s.max)}${unit}`;
}
export function parseSalaryText(text) {
  const m = String(text ?? '').match(/([$€£])\s?(\d[\d,.]*)\s*(k)?\s*(?:-|–|to)\s*[$€£]?\s?(\d[\d,.]*)\s*(k)?/i);
  if (!m) return null;
  const n = (v, k) => Number(v.replace(/,/g, '')) * (k ? 1000 : 1);
  const min = n(m[2], m[3] || (m[5] && Number(m[2]) < 1000)), max = n(m[4], m[5]);
  const period = /\b(hour|hr)\b|\/h\b/i.test(text) ? 'hour' : 'year';
  return { min, max, currency: { $: 'USD', '€': 'EUR', '£': 'GBP' }[m[1]], period };
}

export const normKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function canonicalUrl(url) {
  try { const u = new URL(url); u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^(utm_|gh_src|lever-source|source|ref|src|gclid|fbclid)/i.test(k)) u.searchParams.delete(k); u.hostname = u.hostname.toLowerCase(); return u.href.replace(/\/$/, ''); } catch { return ''; }
}
export function dedupeKey(p) {
  const loc = [...(p.locations ?? [])].map(normKey).sort()[0] ?? '';
  return createHash('sha1').update(`${normKey(p.company)}|${normKey(p.title)}|${loc}`).digest('hex').slice(0, 20);
}

/** Build a normalized posting. `canFill(applyUrl)` tells whether Daymark has an adapter for the apply URL. */
export function normalizePosting(raw, { canFill = () => false } = {}) {
  const applyUrl = canonicalUrl(raw.applyUrl);
  if (!applyUrl || !/^https:/.test(applyUrl)) return null;
  const title = clean(raw.title, 240);
  if (!title) return null;
  const description = htmlToText(raw.description ?? '', 28_000);
  const locations = [...new Set((raw.locations ?? []).map(l => clean(l, 120)).filter(Boolean))].slice(0, 12);
  const salary = raw.salary && (raw.salary.min || raw.salary.max || raw.salary.text) ? { min: raw.salary.min || null, max: raw.salary.max || null, currency: raw.salary.currency || null, period: raw.salary.period || 'year', text: raw.salary.text || salaryText(raw.salary) } : null;
  const company = clean(raw.company, 160) || 'Unknown company';
  const fillable = Boolean(raw.ats) && canFill(applyUrl, raw.ats);
  const posting = {
    id: createHash('sha1').update(applyUrl).digest('hex').slice(0, 24),
    ats: raw.ats || null, board: raw.board || null, sourceId: String(raw.sourceId ?? ''), source: raw.source || raw.ats || 'unknown',
    title, company, locations,
    remoteType: inferRemoteType({ remote: raw.remote, workplaceType: raw.workplaceType, locations, text: description }),
    salary, seniority: inferSeniority(title), yearsExperience: inferYears(description),
    sponsorship: inferSponsorship(description), clearance: inferClearance(`${title} ${description}`),
    applyUrl, sourceUrl: canonicalUrl(raw.sourceUrl || ''), postedAt: toIso(raw.postedAt), description,
    logoUrl: safeImageUrl(raw.logoUrl || raw.logo_url || raw.companyLogo || raw.organization_logo || ''),
    tags: [...new Set((raw.tags ?? []).map(t => clean(t, 40)).filter(Boolean))].slice(0, 8),
    canFill: fillable, applyMode: fillable ? 'auto' : 'manual',
  };
  posting.dedupeKey = dedupeKey(posting);
  return posting;
}
export const toIso = v => { if (v == null || v === '') return ''; const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); };

/** Merge duplicates: same apply URL or same title/company/location. Direct ATS postings beat aggregator copies. */
export function dedupePostings(postings) {
  const byUrl = new Map(), byKey = new Map(), out = [];
  const better = (a, b) => (b.ats && !a.ats) || (Boolean(b.ats) === Boolean(a.ats) && b.description.length > a.description.length);
  for (const p of postings) {
    const existing = byUrl.get(p.applyUrl) ?? byKey.get(p.dedupeKey);
    if (!existing) { out.push(p); byUrl.set(p.applyUrl, p); byKey.set(p.dedupeKey, p); continue; }
    if (better(existing, p)) { out[out.indexOf(existing)] = p; byUrl.set(p.applyUrl, p); byKey.set(p.dedupeKey, p); }
  }
  return out;
}
