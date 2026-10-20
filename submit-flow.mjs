import { detectSecurityCodeStep, fillSecurityCode, securityCodeButton } from './security-code.mjs';
// Final-submit helpers: exact submit-button matching, confirmation detection and review snapshots.
// Nothing here guesses: when the page is ambiguous the caller gets {status:'blocked'} and nothing is clicked.

const COMMON_SUBMIT = /^(Submit|Submit application|Submit your application|Send application|Complete application|Finish application)$/i;
const SUBMIT_BUTTONS = {
  workday: /^Submit$/i,
  greenhouse: /^Submit application$/i,
  lever: /^Submit application$/i,
  ashby: /^Submit application$/i,
  smartrecruiters: /^(Submit application|Submit)$/i,
  workable: COMMON_SUBMIT,
  recruitee: COMMON_SUBMIT,
  rippling: COMMON_SUBMIT,
  pinpoint: COMMON_SUBMIT,
  bamboohr: COMMON_SUBMIT,
  jobvite: COMMON_SUBMIT,
  breezy: COMMON_SUBMIT,
  gem: COMMON_SUBMIT,
  dover: COMMON_SUBMIT,
  teamtailor: COMMON_SUBMIT,
  jazzhr: COMMON_SUBMIT,
  personio: COMMON_SUBMIT,
  comeet: COMMON_SUBMIT,
  eightfold: COMMON_SUBMIT,
  icims: /^(Submit|Submit application)$/i,
  avature: /^(Submit|Submit application|Submit your application)$/i,
  successfactors: /^(Submit|Submit application|Submit your application)$/i,
  ukg: COMMON_SUBMIT,
  adp: COMMON_SUBMIT,
  taleo: COMMON_SUBMIT,
  dayforce: COMMON_SUBMIT,
  paylocity: COMMON_SUBMIT,
  paycom: COMMON_SUBMIT,
};
const CONFIRMATION_TEXT = /thank you for (?:applying|your application)|application (?:has been |was )?(?:successfully )?(?:submitted|received|sent)|successfully (?:submitted|applied)|we(?:'|’)ve received your application|your application is complete\b/i;
const CONFIRMATION_URL = /(?:^|\/)(?:confirmation|confirmed|thank-?you|thanks|submitted|success|applied)(?:\/|$)/i;
const CAPTCHA_SELECTOR = 'iframe[src*="recaptcha"][src*="bframe"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare"],.g-recaptcha:not([data-size="invisible"]),.h-captcha:not([data-size="invisible"]),[data-sitekey]:not([data-size="invisible"])';

export function submitButtonPattern(adapterId) { return SUBMIT_BUTTONS[adapterId] || null; }

// Application forms are often rendered inside an iframe (embedded Greenhouse, iCIMS): look in every frame.
const surfacesOf = page => { try { const frames = typeof page.frames === 'function' ? page.frames() : []; return frames.length ? frames : [page]; } catch { return [page]; } };
const countAcross = async (page, selector) => { let total = 0; for (const surface of surfacesOf(page)) total += await surface.locator(selector).count().catch(() => 0); return total; };
const textAcross = async page => (await Promise.all(surfacesOf(page).map(surface => surface.evaluate(() => document.body?.innerText || '').catch(() => '')))).join('\n');

export function looksSubmitted(text = '', url = '') {
  if (CONFIRMATION_TEXT.test(String(text))) return true;
  try { return CONFIRMATION_URL.test(new URL(url).pathname); } catch { return false; }
}

// Public, selector-free record of what the agent filled so the user can review it before submission.
export function mergeFilledStep(steps = [], step = 'Application', questions = []) {
  const clean = questions
    .filter(q => q && q.type !== 'password' && q.label)
    .map(q => ({
      label: String(q.label).replace(/\*+$/, '').trim().slice(0, 200),
      value: (Array.isArray(q.value) ? q.value.join(', ') : String(q.value ?? '')).slice(0, 600),
      required: Boolean(q.required),
      source: String(q.source || ''),
    }))
    .filter(q => q.value !== '');
  const next = steps.filter(item => item.step !== step);
  next.push({ step: String(step).slice(0, 120), answers: clean });
  return next.slice(-20);
}

export function canAutoApprove(artifacts, missingFacts) {
  if (!artifacts?.resumePdf || !artifacts?.resume) return { ok: false, reason: 'Tailored documents are missing, so this application needs your review.' };
  if (missingFacts.length) return { ok: false, reason: `The tailored resume changed protected details (${missingFacts.slice(0, 3).join(' · ')}). Review it before submitting.` };
  return { ok: true };
}

// True when exactly one visible control matches the final Submit label.
export async function hasSubmitControl(page, pattern) {
  try {
    let visible = 0;
    for (const surface of surfacesOf(page)) {
      const buttons = surface.getByRole('button', { name: pattern });
      for (let i = 0; i < await buttons.count(); i++) if (await buttons.nth(i).isVisible().catch(() => false)) visible++;
    }
    return visible === 1;
  } catch { return false; }
}

// Click the single exact submit control once. `beforeClick` must durably record the attempt first.
export async function submitApplicationPage(page, adapterId, { beforeClick, confirmTimeoutMs = 20_000, pattern: override, onSecurityCode, onVerificationEvent } = {}) {
  const pattern = override || submitButtonPattern(adapterId);
  if (!pattern) return { status: 'blocked', reason: 'This site has no supported submit control.' };
  if (page.isClosed()) return { status: 'blocked', reason: 'The application browser session has closed.' };
  if (await countAcross(page, CAPTCHA_SELECTOR.split(',').map(selector=>selector+':visible').join(','))) return { status: 'blocked', reason: 'A CAPTCHA is on this page. Complete it yourself in the application.' };
  const ERROR_SELECTOR = '[role="alert"]:visible,[aria-invalid="true"]:visible';
  const errors = { count: () => countAcross(page, ERROR_SELECTOR) };
  if (await errors.count()) return { status: 'blocked', reason: 'The employer form is showing validation messages. Resolve them before submitting.' };
  const visible = [];
  for (const surface of surfacesOf(page)) {
    const buttons = surface.getByRole('button', { name: pattern });
    for (let i = 0; i < await buttons.count(); i++) if (await buttons.nth(i).isVisible().catch(() => false)) visible.push(buttons.nth(i));
  }
  if(!visible.length){for (const surface of surfacesOf(page)) { const links = surface.locator('input[type="submit"]:visible'); for(let i=0;i<await links.count();i++){const input=links.nth(i);const label=await input.getAttribute('value');if(pattern.test(label||''))visible.push(input);} }}
  if (visible.length !== 1) return { status: 'blocked', reason: visible.length ? 'More than one submit control matched, so nothing was clicked.' : 'The final Submit control was not found, so nothing was clicked.' };
  if (await visible[0].isDisabled().catch(() => false)) return { status: 'blocked', reason: 'The Submit control is disabled; the employer form still needs input.' };
  const requiredLists=await Promise.all(surfacesOf(page).map(surface=>surface.evaluate(()=>[...document.querySelectorAll('input,textarea,select')].filter(e=>e.getClientRects().length&&!e.disabled&&e.required&&!e.checkValidity()).map(e=>e.labels?.[0]?.innerText||e.getAttribute('aria-label')||'Required field')).catch(()=>null)));
  if(requiredLists.some(list=>!Array.isArray(list)))return {status:'blocked',reason:'Required fields could not be verified.'};
  const required=requiredLists.flat();
  if(required.length)return {status:'blocked',reason:'Complete the required employer fields before submission.',errors:required};
  const baseline=await textAcross(page);
  if(/by (?:clicking|submitting|selecting)[\s\S]{0,180}(?:agree|certif|attest|authorize)/i.test(String(baseline)))return {status:'blocked',reason:'Submission includes a legal attestation. Choose Resolve this step to review and submit it yourself.'};
  await beforeClick?.();
  const startUrl = page.url();
  try { await visible[0].click({ timeout: 10_000 }); }
  catch { return { status: 'unconfirmed', reason: 'The click did not complete cleanly. Check the employer page before trying again.' }; }
  let deadline = Date.now() + confirmTimeoutMs;
  let securityHandled = false;
  const CODE_NEEDED = 'The employer requires a security code. Verification is not confirmed. Check the verification status in Daymark; the application will not be submitted again.';
  const recordVerification = async stage => { await onVerificationEvent?.({stage,at:new Date().toISOString()}); };
  while (Date.now() < deadline) {
    await page.waitForTimeout(750).catch(() => {});
    if (page.isClosed()) break;
    const text = await textAcross(page);
    if (!looksSubmitted(text, page.url())) {
      const codeStep = await detectSecurityCodeStep(page);
      if (codeStep && !securityHandled) {
        if (!securityHandled) await recordVerification('challenge_detected');
        if (typeof onSecurityCode !== 'function') return { status: 'unconfirmed', reason: CODE_NEEDED };
        securityHandled = true;
        await recordVerification('waiting_for_code');
        const code = await onSecurityCode().catch(() => null);
        if (!code) return { status: 'unconfirmed', reason: CODE_NEEDED };
        await recordVerification('code_found');
        const retained = await fillSecurityCode(codeStep, code).catch(() => false);
        const verify = retained ? await securityCodeButton(codeStep) : null;
        if (!verify) return { status: 'unconfirmed', reason: CODE_NEEDED };
        await recordVerification('verification_attempted');
        await verify.click({ timeout: 10_000 }).catch(() => {});
        deadline = Date.now() + confirmTimeoutMs;
        continue;
      }
    }
    if (looksSubmitted(text, page.url()) && (page.url() !== startUrl || CONFIRMATION_TEXT.test(text)&&!CONFIRMATION_TEXT.test(baseline))) {if(securityHandled)await recordVerification('verification_confirmed');return { status: 'submitted' };}
    if(await errors.count())return securityHandled?{status:'unconfirmed',reason:CODE_NEEDED}:{status:'rejected',reason:'The employer rejected one or more answers. Resolve the validation messages before resubmitting.'};
  }
  return { status: 'unconfirmed', reason: 'Submit was clicked but no confirmation appeared. Check the employer page or your inbox before trying again.' };
}
