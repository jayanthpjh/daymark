// Rule filters + embedding match score. `embed(texts) -> Promise<number[][]>` is injected (the local
// nomic-embed-text model arrives later); without it the score falls back to role-term rules only.
import { countriesIn, mentionsForeignRegion, mentionsBroadRegion } from './geo.mjs';
const words = s => String(s).toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
export const splitRoles = value => String(value ?? '').split(/[\n,;]/).map(x => x.trim()).filter(Boolean).slice(0, 24);

/** A role term matches a title when the phrase appears or every word of it does. */
export function titleMatchesRole(title, roles) {
  const t = String(title).toLowerCase(), tw = new Set(words(title));
  return roles.some(role => { const r = role.toLowerCase(); return t.includes(r) || words(role).every(w => tw.has(w)); });
}
// A search term can name a country ("United States"), a US state ("Texas") or a place ("Austin"). Country and state terms
// give us the countries the person can work in; a place term does not, so remote roles stay unrestricted for place-only searches.
function wantedCountries(terms) {
  const wanted = new Set();
  for (const term of terms) for (const id of countriesIn(term.length === 2 && term === term.toUpperCase() ? `x, ${term}` : term)) wanted.add(id);
  return wanted;
}
const hasTerm = (loc, term) => {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  return t.length <= 3 ? new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(loc) : loc.includes(t);
};
/**
 * Does a posting fit where the person wants to work?
 * - A named place or country in the search that appears in the posting's locations is a match, as is a US state or code
 *   when the search is for the United States ("Austin, TX" fits "United States").
 * - "Remote" with no country named fits any search. "Remote, Brazil" or "Remote - EMEA" does not fit a United States search.
 * - Postings with no location are kept: we cannot tell, so the person decides.
 */
export function locationMatches(posting, locationTerms) {
  if (!locationTerms.length) return true;
  const loc = posting.locations.join(' ; ').toLowerCase();
  const remote = posting.remoteType === 'remote';
  if (!loc) return true;
  if (locationTerms.some(t => t.trim().toLowerCase() === 'remote') && remote) return true;
  if (locationTerms.some(t => hasTerm(loc, t))) return true;
  const wanted = wantedCountries(locationTerms);
  const named = countriesIn(posting.locations.join(' ; '));
  if ([...wanted].some(id => named.has(id))) return true;
  if (!remote) return false;
  if (!wanted.size) return true;                       // place-only search: keep legacy behavior for remote roles
  if (mentionsBroadRegion(loc)) return true;
  if (named.size || mentionsForeignRegion(loc)) return false; // remote, but tied to another country or region
  return true;                                          // plain "Remote"
}

export function ruleFilter(posting, rules = {}) {
  if (rules.clearance && posting.clearance) return 'Requires a security clearance';
  if (rules.remoteOnly && posting.remoteType !== 'remote') return 'Not remote';
  if ((rules.excludedCompanies ?? []).some(c => posting.company.toLowerCase().includes(String(c).toLowerCase()))) return 'Excluded company';
  if ((rules.excludedTitles ?? []).some(t => posting.title.toLowerCase().includes(String(t).toLowerCase()))) return 'Excluded title';
  if (rules.minSalary && posting.salary?.max && posting.salary.period === 'year' && posting.salary.max < rules.minSalary) return 'Below minimum salary';
  return '';
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
const postingText = p => `${p.title}\n${p.company}\n${p.locations.join(', ')}\n${p.description}`.slice(0, 6000);

function ruleScore(posting, roles) {
  const hay = `${posting.title} ${posting.description}`.toLowerCase();
  if (!roles.length) return { score: 50, why: [] };
  const inTitle = titleMatchesRole(posting.title, roles);
  const hits = roles.filter(r => hay.includes(r.toLowerCase())).length;
  const score = Math.max(30, Math.min(98, Math.round((inTitle ? 70 : 40) + (hits / roles.length) * 28)));
  return { score, why: [inTitle ? 'Title matches one of your target roles' : hits ? `Description mentions ${hits} of your target roles` : 'No target role found in the title'] };
}

/**
 * Score postings against the resume. Returns [{ posting, score, why }] in input order.
 * Embedding similarity (0.25→0.75 cosine mapped to 0→100) carries 60% when `embed` is given.
 */
export async function scorePostings(postings, { profileText = '', roles = [], embed = null, batchSize = 16 } = {}) {
  const base = postings.map(p => ruleScore(p, roles));
  let sims = null;
  if (embed && profileText.trim() && postings.length) {
    try {
      const [profileVec] = await embed([profileText.slice(0, 6000)]);
      sims = [];
      for (let i = 0; i < postings.length; i += batchSize) sims.push(...await embed(postings.slice(i, i + batchSize).map(postingText)));
      sims = sims.map(v => cosine(profileVec, v));
    } catch { sims = null; /* embedding model unavailable: rules only */ }
  }
  return postings.map((posting, i) => {
    const rule = base[i], why = [...rule.why];
    let score = rule.score;
    if (sims) {
      const e = Math.max(0, Math.min(100, Math.round((sims[i] - 0.25) / 0.5 * 100)));
      score = Math.round(0.4 * rule.score + 0.6 * e);
      why.push(`Resume similarity ${Math.round(sims[i] * 100)}%`);
    }
    if (posting.yearsExperience) why.push(`Asks for ${posting.yearsExperience}+ years of experience`);
    if (posting.sponsorship === 'no') why.push('Does not sponsor visas');
    if (!posting.canFill) why.push(`Manual apply: Daymark has no ${posting.ats || 'matching'} form filler`);
    return { posting, score: Math.max(0, Math.min(100, score)), why };
  });
}
