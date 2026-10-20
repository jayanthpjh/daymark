// Universal structured-data & JSON/HTML ATS board reader for additional Tsenta-supported ATS platforms:
// Teamtailor, Dover, JazzHR, Personio, Comeet, Gem, Eightfold AI, iCIMS, Avature, SAP SuccessFactors,
// UKG (UltiPro), ADP Workforce Now, Oracle Taleo / Cloud HCM, Dayforce, Paylocity, and Paycom.
import { toIso } from '../schema.mjs';

function extractJsonLdPostings(html) {
  const out = [];
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html || '').matchAll(scriptRe)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ? parsed['@graph'] : [parsed];
      for (const item of items) {
        if (item && (item['@type'] === 'JobPosting' || (Array.isArray(item['@type']) && item['@type'].includes('JobPosting')))) {
          out.push(item);
        }
      }
    } catch { /* ignore malformed JSON-LD block */ }
  }
  return out;
}

function locationFromJsonLd(jobLocation) {
  const locs = Array.isArray(jobLocation) ? jobLocation : jobLocation ? [jobLocation] : [];
  return locs.map(loc => {
    const addr = loc?.address || loc;
    if (typeof addr === 'string') return addr;
    return [addr?.addressLocality, addr?.addressRegion, addr?.addressCountry?.name || addr?.addressCountry].filter(Boolean).join(', ');
  }).filter(Boolean);
}

export function createStructuredAtsSource({ id, boardUrl, applyUrlFor, jsonExtractor, format = 'html' }) {
  return {
    id,
    boardUrl,
    async fetchBoard(board, { http }) {
      const url = boardUrl(board);
      if (!url) return [];
      if (format === 'html' && (typeof http.htmlAllowed !== 'function' || !(await http.htmlAllowed(url)))) return [];
      const text = await http.text(url, { redirect: format === 'html' ? 'manual' : 'follow', headers: { accept: 'application/json, text/html, application/xhtml+xml' } });
      // 1. Try JSON payload first if endpoint returns JSON
      try {
        const data = JSON.parse(text);
        if (jsonExtractor) {
          const extracted = jsonExtractor(data, board);
          if (Array.isArray(extracted)) return extracted;
        }
        const list = Array.isArray(data) ? data : (data.jobs ?? data.postings ?? data.positions ?? data.results ?? data.data ?? data.offers ?? []);
        if (Array.isArray(list) && list.length) {
          return list.map(j => {
            const jobId = j.id ?? j.uuid ?? j.reqId ?? j.slug ?? j.shortcode ?? j.code ?? '';
            const loc = j.location?.name || j.location_name || [j.city, j.state, j.country].filter(Boolean).join(', ') || (typeof j.location === 'string' ? j.location : '');
            return {
              ats: id,
              board: board.token,
              source: id,
              sourceId: String(jobId),
              title: j.title || j.name || j.positionTitle || j.jobTitle || '',
              company: j.company?.name || j.companyName || board.company || board.token,
              locations: Array.isArray(j.locations) ? j.locations.map(l => typeof l === 'string' ? l : l?.name || l?.city || '').filter(Boolean) : [loc].filter(Boolean),
              remote: Boolean(j.remote || j.isRemote || /remote/i.test(String(j.workplaceType || j.remoteStatus || loc))),
              workplaceType: j.workplaceType || j.remoteStatus,
              description: j.description || j.descriptionHtml || j.jobDescription || j.body || '',
              applyUrl: j.applyUrl || j.url || j.hostedUrl || j.absolute_url || applyUrlFor(board, jobId),
              postedAt: toIso(j.publishedAt || j.postedAt || j.createdAt || j.created_at || j.datePosted),
              tags: [j.department?.name || j.department || j.category].filter(Boolean),
            };
          }).filter(p => p.title && p.applyUrl);
        }
      } catch { if (format === 'json') return []; /* fall through to HTML / JSON-LD extraction */ }

      // 2. Try Schema.org JobPosting JSON-LD embedded on career portal pages
      const ldPostings = extractJsonLdPostings(text);
      if (ldPostings.length) {
        return ldPostings.map((ld, idx) => {
          const jobId = ld.identifier?.value || ld.identifier || ld.reqId || String(idx + 1);
          const locations = locationFromJsonLd(ld.jobLocation);
          return {
            ats: id,
            board: board.token,
            source: id,
            sourceId: String(jobId),
            title: ld.title || ld.name || '',
            company: ld.hiringOrganization?.name || board.company || board.token,
            locations,
            remote: /telecommute|remote/i.test(String(ld.jobLocationType || '')) || locations.some(l => /remote/i.test(l)) ? true : undefined,
            description: ld.description || '',
            applyUrl: ld.url || ld.directApplyUrl || applyUrlFor(board, jobId),
            postedAt: toIso(ld.datePosted),
            tags: [ld.occupationalCategory, ld.employmentType].flat().filter(Boolean),
          };
        }).filter(p => p.title && p.applyUrl);
      }

      // 3. Fallback: extract job detail links from HTML
      const out = [];
      const seen = new Set();
      const linkRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      for (const m of text.matchAll(linkRe)) {
        const href = m[1].trim();
        if (!/(?:\/jobs?\/|\/careers?\/|\/positions?\/|\/postings?\/|\/o\/|\/p\/|\/v\/|jobId=|requisitionId=)/i.test(href)) continue;
        const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!title || title.length < 3 || title.length > 180 || /^(apply|view|read more|learn more|search|jobs|careers|home|sign in|login)$/i.test(title)) continue;
        let resolved;
        try { resolved = new URL(href, url).href; } catch { continue; }
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        out.push({
          ats: id,
          board: board.token,
          source: id,
          sourceId: String(out.length + 1),
          title,
          company: board.company || board.token,
          locations: [],
          description: '',
          applyUrl: resolved,
          postedAt: '',
          tags: [],
        });
      }
      return out;
    },
  };
}

export const gem = createStructuredAtsSource({
  id: 'gem',
  format: 'json',
  boardUrl: b => `https://api.gem.com/job_board/v0/${encodeURIComponent(b.token)}/job_posts/`,
  applyUrlFor: (b, id) => `https://jobs.gem.com/${encodeURIComponent(b.token)}/${encodeURIComponent(id)}`,
});

export const dover = createStructuredAtsSource({
  id: 'dover',
  format: 'json',
  boardUrl: b => `https://app.dover.com/api/v1/careers-page/${encodeURIComponent(b.token)}/jobs`,
  applyUrlFor: (b, id) => `https://app.dover.com/apply/${encodeURIComponent(b.token)}/${encodeURIComponent(id)}`,
});

export const teamtailor = createStructuredAtsSource({
  id: 'teamtailor',
  boardUrl: b => `https://${b.host || `${encodeURIComponent(b.token)}.teamtailor.com`}/jobs`,
  applyUrlFor: (b, id) => `https://${b.host || `${encodeURIComponent(b.token)}.teamtailor.com`}/jobs/${encodeURIComponent(id)}`,
});

export const jazzhr = createStructuredAtsSource({
  id: 'jazzhr',
  boardUrl: b => `https://${encodeURIComponent(b.token)}.applytojob.com/apply`,
  applyUrlFor: (b, id) => `https://${encodeURIComponent(b.token)}.applytojob.com/apply/${encodeURIComponent(id)}`,
});

export const personio = createStructuredAtsSource({
  id: 'personio',
  format: 'json',
  boardUrl: b => `https://${b.host || `${encodeURIComponent(b.token)}.jobs.personio.com`}/search.json`,
  applyUrlFor: (b, id) => `https://${b.host || `${encodeURIComponent(b.token)}.jobs.personio.com`}/job/${encodeURIComponent(id)}`,
});

export const comeet = createStructuredAtsSource({
  id: 'comeet',
  boardUrl: b => `https://www.comeet.com/jobs/${encodeURIComponent(b.token)}`,
  applyUrlFor: (b, id) => `https://www.comeet.com/jobs/${encodeURIComponent(b.token)}/${encodeURIComponent(id)}`,
});

export const eightfold = createStructuredAtsSource({
  id: 'eightfold',
  format: 'json',
  boardUrl: b => `https://${b.host || `${encodeURIComponent(b.token)}.eightfold.ai`}/api/apply/v2/jobs?domain=${encodeURIComponent(b.token)}&num=50`,
  applyUrlFor: (b, id) => `https://${b.host || `${encodeURIComponent(b.token)}.eightfold.ai`}/careers/job/${encodeURIComponent(id)}`,
});

export const icims = createStructuredAtsSource({
  id: 'icims',
  boardUrl: b => `https://${b.host || `${encodeURIComponent(b.token)}.icims.com`}/jobs/search?ss=1&in_iframe=1`,
  applyUrlFor: (b, id) => `https://${b.host || `${encodeURIComponent(b.token)}.icims.com`}/jobs/${encodeURIComponent(id)}/job`,
});

export const avature = createStructuredAtsSource({
  id: 'avature',
  boardUrl: b => `https://${b.host || `${encodeURIComponent(b.token)}.avature.net`}/careers/SearchJobs`,
  applyUrlFor: (b, id) => `https://${b.host || `${encodeURIComponent(b.token)}.avature.net`}/careers/JobDetail/${encodeURIComponent(id)}`,
});

export const successfactors = createStructuredAtsSource({
  id: 'successfactors',
  boardUrl: b => `https://${b.host || `${encodeURIComponent(b.token)}.jobs2web.com`}/search/`,
  applyUrlFor: (b, id) => `https://${b.host || `${encodeURIComponent(b.token)}.jobs2web.com`}/job/${encodeURIComponent(id)}`,
});

export const ukg = createStructuredAtsSource({
  id: 'ukg',
  boardUrl: b => `https://recruiting.ultipro.com/${encodeURIComponent(b.token)}`,
  applyUrlFor: (b, id) => `https://recruiting.ultipro.com/${encodeURIComponent(b.token)}/JobBoard/OpportunityDetail?opportunityId=${encodeURIComponent(id)}`,
});

export const adp = createStructuredAtsSource({
  id: 'adp',
  boardUrl: b => `https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=${encodeURIComponent(b.token)}`,
  applyUrlFor: (b, id) => `https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=${encodeURIComponent(b.token)}&jobId=${encodeURIComponent(id)}`,
});

export const taleo = createStructuredAtsSource({
  id: 'taleo',
  boardUrl: b => `https://${b.host || `${encodeURIComponent(b.token)}.taleo.net`}/careersection/2/jobsearch.ftl`,
  applyUrlFor: (b, id) => `https://${b.host || `${encodeURIComponent(b.token)}.taleo.net`}/careersection/2/jobdetail.ftl?job=${encodeURIComponent(id)}`,
});

export const dayforce = createStructuredAtsSource({
  id: 'dayforce',
  boardUrl: b => `https://jobs.dayforcehcm.com/en-US/${encodeURIComponent(b.token)}/CANDIDATEPORTAL`,
  applyUrlFor: (b, id) => `https://jobs.dayforcehcm.com/en-US/${encodeURIComponent(b.token)}/CANDIDATEPORTAL/jobs/${encodeURIComponent(id)}`,
});

export const paylocity = createStructuredAtsSource({
  id: 'paylocity',
  boardUrl: b => `https://recruiting.paylocity.com/recruiting/jobs/All/${encodeURIComponent(b.token)}`,
  applyUrlFor: (b, id) => `https://recruiting.paylocity.com/recruiting/jobs/Details/${encodeURIComponent(id)}`,
});

export const paycom = createStructuredAtsSource({
  id: 'paycom',
  boardUrl: b => `https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey=${encodeURIComponent(b.token)}`,
  applyUrlFor: (b, id) => `https://www.paycomonline.net/v4/ats/web.php/jobs/ViewJobDetails?job=${encodeURIComponent(id)}&clientkey=${encodeURIComponent(b.token)}`,
});
