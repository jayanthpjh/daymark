// Polite HTTP client for public job-board APIs: per-host concurrency, minimum delay between
// requests to a host, retry with backoff on 429/5xx, and an optional robots.txt check for HTML pages.
// `fetch` is injected so tests never touch the network.
const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createHttp({ fetch = globalThis.fetch, delayMs = 400, perHostConcurrency = 2, retries = 2, timeoutMs = 25_000, userAgent = 'DaymarkJobSources/1.0 (personal job search; contact via repo owner)', sleep = sleepDefault, now = Date.now,
  // Hosts known to throttle sooner get a slower pace from the start (live trial: Workable answered 429 to 59% of requests at 400 ms).
  hostDelayMs = { 'apply.workable.com': 1000 }, maxDelayMs = 10_000 } = {}) {
  const hosts = new Map();
  const robotsCache = new Map();
  const slot = host => { let s = hosts.get(host); if (!s) hosts.set(host, s = { active: 0, queue: [], nextAt: 0, delay: Math.max(delayMs, hostDelayMs[host] ?? 0), throttled: 0 }); return s; };

  function acquire(host) {
    const s = slot(host);
    return new Promise(resolve => {
      const tryRun = async () => {
        if (s.active >= perHostConcurrency) return false;
        s.active++;
        const wait = Math.max(0, s.nextAt - now());
        s.nextAt = Math.max(s.nextAt, now()) + s.delay;
        if (wait) await sleep(wait);
        resolve(() => { s.active--; const next = s.queue.shift(); if (next) next(); });
        return true;
      };
      const attempt = () => { tryRun().then(ok => { if (!ok) s.queue.push(attempt); }); };
      attempt();
    });
  }

  async function request(url, options = {}) {
    const host = new URL(url).host;
    let lastError;
    // A host that has answered 429 six times in a row without one success is refusing us: stop asking for the rest of this run.
    if (slot(host).throttled >= 6) { const error = new Error(`${host} is throttling requests; skipped for this run`); error.status = 429; throw error; }
    for (let attempt = 0; attempt <= retries; attempt++) {
      const release = await acquire(host);
      try {
        const response = await fetch(url, { ...options, headers: { 'user-agent': userAgent, accept: 'application/json', ...options.headers }, signal: options.signal || AbortSignal.timeout(timeoutMs) });
        // A throttled host is slowed for the rest of this run: each 429 doubles its spacing, up to a ceiling.
        if (response.status === 429) { const sl = slot(host); sl.throttled++; sl.delay = Math.min(maxDelayMs, Math.max(sl.delay, delayMs) * 2); }
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          const retryAfter = Number(response.headers?.get?.('retry-after'));
          release();
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : delayMs * 2 ** (attempt + 1));
          continue;
        }
        release();
        if (response.status !== 429) slot(host).throttled = 0;
        return response;
      } catch (error) {
        release();
        lastError = error;
        if (attempt < retries) await sleep(delayMs * 2 ** (attempt + 1));
      }
    }
    throw lastError;
  }

  async function json(url, options) {
    const response = await request(url, options);
    if (!response.ok) { const error = new Error(`HTTP ${response.status} for ${new URL(url).host}`); error.status = response.status; throw error; }
    return response.json();
  }
  async function text(url, options) {
    const response = await request(url, { ...options, headers: { accept: 'text/plain,*/*', ...options?.headers } });
    if (!response.ok) { const error = new Error(`HTTP ${response.status} for ${new URL(url).host}`); error.status = response.status; throw error; }
    return response.text();
  }

  async function robotsAllows(url) {
    const u = new URL(url);
    let rules = robotsCache.get(u.origin);
    if (!rules) {
      rules = [];
      try {
        const response = await request(`${u.origin}/robots.txt`, { headers: { accept: 'text/plain' } });
        if (response.ok) rules = parseRobots(await response.text(), userAgent);
      } catch { /* unreachable robots.txt: treat as allowed */ }
      robotsCache.set(u.origin, rules);
    }
    return !rules.some(rule => u.pathname.startsWith(rule));
  }

  return { request, json, text, robotsAllows };
}

// Returns the Disallow prefixes that apply to us (specific agent group wins over `*`).
export function parseRobots(body, userAgent = '') {
  const token = String(userAgent).split(/[\/\s]/)[0].toLowerCase();
  const groups = [];
  let current = null, lastWasAgent = false;
  for (const raw of String(body).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), value = line.slice(i + 1).trim();
    if (key === 'user-agent') { if (!lastWasAgent) { current = { agents: [], disallow: [] }; groups.push(current); } current.agents.push(value.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (key === 'disallow' && current && value) current.disallow.push(value);
  }
  const specific = groups.filter(g => token && g.agents.includes(token));
  const chosen = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
  return chosen.flatMap(g => g.disallow);
}
