// Dynamic adapters: for career sites without a built-in adapter, find the real application form from the page
// itself, remember what was learned per host, and keep human review until a submission there has been confirmed.
import fs from 'node:fs/promises';
import path from 'node:path';

export const DYNAMIC_SUBMIT = /^(submit( your)?( application)?|send application|complete application|finish application)$/i;
const APPLY_TEXT = /^(apply( now| today| here| online| for this (job|role|position)| to this (job|role|position)| with (resume|cv)| manually| without linkedin)?|i['’]m interested|start (your |an )?application|begin application|continue to (the )?application|submit (your )?(resume|cv))$/i;
// Login-walled aggregators: filling them violates their terms and needs the user's own session.
const BLOCKED_HOST = /(^|\.)(linkedin|indeed|glassdoor|ziprecruiter|monster|simplyhired|facebook|x|twitter)\.com$/i;

export function dynamicAdapterFor(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host.includes('.') || BLOCKED_HOST.test(host)) return null;
  // Versioned like the built-in adapters so task snapshots validate. Entry already requires a real applicant form,
  // and account, CAPTCHA and verification screens still pause the preflight, so it runs in guest mode.
  return { id: 'dynamic', version: 1, dynamic: true, host, authMode: 'guest', selectors: {}, flow: ['application_entry', 'read_form', 'fill', 'validate', 'upload', 'final_review'] };
}

// A posting page is full of search boxes, filters and job-alert signups; only an applicant form counts:
// a resume upload, or at least three applicant fields, inside a form that is not a job alert.
async function hasForm(page) {
  try {
    return await page.evaluate(() => {
      const applicant = /first.?name|last.?name|full.?name|your name|^name$|e-?mail|phone|mobile|resume|\bcv\b|cover.?letter|linkedin|street|address|postal|zip/i;
      const notApplicant = /search|keyword|filter|newsletter|subscribe|sort|job.?alert/i;
      const alertForm = /send me jobs|job alert|email me (similar )?jobs|subscribe|notify me|talent (community|network)|join our/i;
      let score = 0, file = false;
      for (const e of document.querySelectorAll('input,textarea,select')) {
        if (!e.getClientRects().length || e.disabled || ['hidden', 'search', 'submit', 'button', 'image', 'reset'].includes(e.type)) continue;
        const form = e.closest('form');
        if (form && alertForm.test(form.innerText || '')) continue;
        const text = [e.name, e.id, e.placeholder, e.autocomplete, e.getAttribute('aria-label'), e.labels?.[0]?.innerText].join(' ');
        if (notApplicant.test(text)) continue;
        if (e.type === 'file') file = true;
        if (e.type === 'file' || applicant.test(text)) score++;
      }
      return file || score >= 3;
    });
  } catch { return false; }
}
const needsOneTimeCode = page => page.evaluate(() => /verify with a one-time (text )?code|enter the (one-time|verification) code we sent|continue with (email|phone)/i.test(document.body?.innerText || '')).catch(() => false);

async function clickApply(page, context, clicked) {
  const controls = page.locator('a,button,[role="button"],input[type="submit"],input[type="button"]');
  const count = Math.min(await controls.count().catch(() => 0), 400);
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const text = ((await control.innerText().catch(() => '')) || (await control.getAttribute('value').catch(() => '')) || (await control.getAttribute('aria-label').catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (!APPLY_TEXT.test(text) || clicked.has(page.url() + '|' + text.toLowerCase())) continue;
    if (!await control.isVisible().catch(() => false)) continue;
    clicked.add(page.url() + '|' + text.toLowerCase());
    const popup = context?.waitForEvent ? context.waitForEvent('page', { timeout: 6000 }).catch(() => null) : Promise.resolve(null);
    try { await control.click({ timeout: 8000 }); } catch { continue; }
    return { opened: await popup, text: text.slice(0, 60) };
  }
  return null;
}

// Opens the application from a posting page, following up to three steps (Apply → "how do you want to apply" → form).
export async function enterDynamicApplication(page, context, { detect = () => null, settleMs = 2500 } = {}) {
  if (await hasForm(page)) return { page, how: 'direct', applyText: '' };
  const clicked = new Set();let current = page, how = 'none', applyText = '';
  for (let hop = 0; hop < 3; hop++) {
    const result = await clickApply(current, context, clicked);
    if (!result) break;
    applyText ||= result.text;how = result.opened ? 'popup' : 'click';
    if (result.opened) current = result.opened;
    await current.waitForLoadState('domcontentloaded').catch(() => {});
    await current.waitForTimeout(settleMs).catch(() => {});
    let landed = null;
    try { landed = detect(new URL(current.url()).hostname); } catch { /* about:blank */ }
    if (landed || await hasForm(current)) return { page: current, how, applyText, landedHost: new URL(current.url()).hostname };
    if (await needsOneTimeCode(current)) return { page: current, how: 'otp', applyText };
  }
  if (await needsOneTimeCode(current)) return { page: current, how: 'otp', applyText };
  return { page: current, how: how === 'none' ? 'none' : 'noform', applyText };
}

const cachePath = (dir, host) => path.join(dir, 'adapters', `${String(host).replace(/[^a-z0-9.-]/gi, '_')}.json`);
export async function readAdapterCache(dir, host) {
  try { return JSON.parse(await fs.readFile(cachePath(dir, host), 'utf8')); } catch { return null; }
}
export async function updateAdapterCache(dir, host, patch) {
  const current = (await readAdapterCache(dir, host)) || { host, learnedAt: new Date().toISOString(), runs: 0, trust: { submitted: 0 } };
  const next = { ...current, ...patch, trust: { ...current.trust, ...(patch.trust || {}) }, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.join(dir, 'adapters'), { recursive: true, mode: 0o700 });
  await fs.writeFile(cachePath(dir, host), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}
export const adapterTrusted = cache => (cache?.trust?.submitted || 0) > 0;
