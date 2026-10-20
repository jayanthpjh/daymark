const visible = async locator => await locator.count().catch(() => 0) > 0 && await locator.isVisible().catch(() => false);

// This is a gate, not a login implementation: ATS-specific authenticators run
// first, then this checks that no account challenge remains before applicant data.
export async function authPreflightScreen(page, { authenticated = false, guest = false } = {}) {
  if (authenticated) return 'authenticated';
  // The invisible-score badge (size=invisible) is not a challenge the applicant must solve.
  const challenge = page.locator('iframe[src*="recaptcha"]:not([src*="size=invisible"]),iframe[src*="hcaptcha"]:not([src*="size=invisible"]),iframe[title*="challenge" i],[data-sitekey]:not([data-size="invisible"]):not(.grecaptcha-badge)').first();
  if (await visible(challenge)) return 'captcha';
  if (await visible(page.locator('input[autocomplete="one-time-code"],input[name*="verification" i],input[name*="otp" i]').first())) return 'verification';
  if (await visible(page.getByRole('heading', { name: /^(create account|register|sign up)$/i }).first())) return 'authentication';
  if (await visible(page.locator('input[autocomplete="new-password"],input[type="password"][name*="new" i]').first()) ||
      await visible(page.getByRole('heading', { name: /^(reset|change) password$/i }).first())) return 'password_reset';
  if (await visible(page.getByRole('heading', { name: /^(sign in|log in|login|create account|register|sign up)$/i }))) return 'authentication';
  const password = page.locator('input[type="password"]').first();
  if (await visible(password)) return 'authentication';
  const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  if (/verify (?:your )?(?:email|account)|enter (?:the )?(?:verification|one.time) code|check your (?:email|inbox)/i.test(body)) return 'verification';
  if (/(?:your )?session (?:has )?(?:expired|timed out)|session expired|sign in to continue|log in to continue/i.test(body)) return 'authentication';
  // Guest forms often carry an invisible-reCAPTCHA notice; only a visible challenge element counts there.
  if (/security challenge|are you human/i.test(body)) return 'captcha';
  // A user profile surface is positive evidence; a guest application form is not.
  const accountSurface = await page.locator('a[href*="logout" i],button[aria-label*="account" i],[data-testid*="signed-in" i],[data-automation-id*="signedIn" i]').count().catch(() => 0);
  const hasLoginControls = await page.locator('a,button').evaluateAll(nodes => nodes.some(node => /^(sign in|log in|login|create account|register|sign up)$/i.test((node.innerText || node.getAttribute('aria-label') || '').trim()))).catch(() => false);
  if (!accountSurface && !hasLoginControls && /apply now|application form|submit application/i.test(body)) return 'guest_only';
  // Guest-capable ATSs often keep a header "Sign in" link; real sign-in, verification and CAPTCHA screens were handled above.
  if (guest && !accountSurface) {
    const fields = await page.locator('input:not([type="hidden"]):not([type="search"]):not([type="submit"]):not([type="button"]),textarea,select').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && !node.disabled).length).catch(() => 0);
    if (fields >= 3 || /apply now|application form|submit application/i.test(body)) return 'guest_only';
  }
  return authenticated || accountSurface ? 'authenticated' : 'unknown';
}

export async function assertAuthenticatedBeforeApplicationData(page, options) {
  const screen = await authPreflightScreen(page, options);
  if (screen === 'authenticated') return true;
  if (screen === 'guest_only' && options?.guest) return true;
  if (screen === 'guest_only') { const error = new Error('This site requires an applicant account but has no supported sign-in flow; resolve sign-in before continuing. No profile or resume was sent.'); error.authStatus = 'authentication'; throw error; }
  const reasons = {
    authentication: 'Your employer session is signed out or expired. Sign in in the Daymark browser, then Continue processing; the saved application step will be checked again.',
    verification: 'ATS verification is required before application information can be entered. Complete verification in the employer session, then continue.',
    password_reset: 'Password recovery needs your review. Finish the reset in the employer session, update the saved ATS password, then continue.',
    captcha: 'Complete the ATS security challenge in the employer session, then continue.',
    unknown: 'Daymark could not verify an authenticated ATS account. Resolve this step in the employer session; no profile information or resume was sent.',
  };
  const error = new Error(reasons[screen] || reasons.unknown);
  error.authStatus = screen;
  throw error;
}
