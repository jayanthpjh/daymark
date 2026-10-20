import { authPreflightScreen } from './ats-auth-preflight.mjs';

export function atsLoginScope(raw, email) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsupported ATS login URL.');
  return `ats:${url.hostname.toLowerCase()}/${String(email).trim().toLowerCase()}`;
}

const pause = message => { const error = new Error(message); error.authStatus = 'authentication'; return error; };
const visible = async locator => await locator.count() > 0 && await locator.isVisible().catch(() => false);

// Bounded sign-in only. Registration, password resets and consent remain user checkpoints.
async function runSignInATS(page, { host, credentials, account = {}, saveAccount, assertActive, findCode, guest = false, profile = null, wait = ms => page.waitForTimeout(ms) }) {
  const check = async () => {
    await assertActive();
    const url = new URL(page.url());
    if (url.protocol !== 'https:' || url.hostname !== host) throw pause('Sign-in left the verified ATS host. Resolve this step in the employer browser.');
  };
  await check();
  let screen = await authPreflightScreen(page, { guest });
  if (screen === 'authenticated') return true;
  if (['captcha', 'password_reset'].includes(screen)) throw pause('Complete the employer security challenge or password recovery in the browser.');
  const registerAccount = async () => {
    if (!profile?.registration) return false;
    if (!credentials?.username || !credentials?.password) throw pause('Add your application email and an ATS password in Settings before creating this account.');
    if (account.status === 'active' || account.status === 'existing') return false;
    if (account.registrationAttemptAt) throw pause('Account creation was already started. Complete any employer prompt in the browser before continuing; Daymark will not submit registration twice.');
    let registration = await visible(page.getByRole('heading', { name: /^(create account|register|sign up)$/i }));
    if (!registration) {
      const create = page.getByRole('link', { name: /^(create account|create an account|register|sign up)$/i })
        .or(page.getByRole('button', { name: /^(create account|create an account|register|sign up)$/i }));
      if (await create.count() === 1 && await create.isVisible().catch(() => false)) {
        await check();
        await create.click({ timeout: 10_000 }).catch(() => { throw pause('The employer registration page did not open. Complete account creation in the browser.'); });
        await wait(500); await check();
        registration = await visible(page.getByRole('heading', { name: /^(create account|register|sign up)$/i }));
      }
    }
    if (!registration) return false;
    const passwords = page.locator('input[type="password"]:visible');
    const form = passwords.first().locator('xpath=ancestor::form[1]');
    if (await passwords.count() !== 2 || await form.count() !== 1 || await form.locator('input[type="password"]:visible').count() !== 2 || await form.locator('input[type="checkbox"]:visible').count()) {
      throw pause('The employer registration form needs your review. Complete its fields or consent in the browser, then continue.');
    }
    const formEmail = form.locator('input[type="email"]:visible,input[autocomplete="email"]:visible,input[name*="email" i]:visible');
    if (await formEmail.count() !== 1) throw pause('The employer registration email field is unclear. Complete registration in the browser.');
    const firstName = String(profile.firstName || '').trim();
    const lastName = String(profile.lastName || '').trim();
    for (const [selector, value] of [['input[autocomplete="given-name"]:visible,input[name*="first" i]:visible', firstName], ['input[autocomplete="family-name"]:visible,input[name*="last" i]:visible', lastName]]) {
      const field = form.locator(selector);
      const count = await field.count();
      if (count > 1) throw pause('The employer registration name fields are ambiguous. Complete registration in the browser.');
      if (count === 1 && value) await field.fill(value);
    }
    const submit = form.getByRole('button', { name: /^(create account|register|sign up|submit)$/i });
    if (await submit.count() !== 1 || await submit.isDisabled()) throw pause('The employer registration action is unclear. Complete registration in the browser.');
    await formEmail.fill(credentials.username);
    await passwords.nth(0).fill(credentials.password);
    await passwords.nth(1).fill(credentials.password);
    const incomplete = await form.locator('input[required]:visible,select[required]:visible,textarea[required]:visible,[aria-required="true"]:visible').evaluateAll(nodes => nodes.some(node => !String(node.value || '').trim() && node.type !== 'checkbox'));
    if (incomplete) throw pause('The employer registration form has required details Daymark cannot safely infer. Complete it in the browser.');
    await check();
    account = { ...account, status: 'pending', registrationAttemptAt: new Date().toISOString() };
    await saveAccount(account);
    await check();
    await submit.click({ timeout: 10_000 }).catch(() => { throw pause('Registration had an uncertain response. Inspect the employer page before continuing.'); });
    await wait(500); await check();
    return true;
  };
  let registrationStarted = await registerAccount();
  let password = page.locator('input[type="password"]:visible');
  const submitName = profile?.submit || /^(sign in|log in|login)$/i;
  const userSelector = ['input[autocomplete="username"]:visible', 'input[type="email"]:visible', 'input[name*="email" i]:visible', 'input[name*="user" i]:visible', profile?.username].filter(Boolean).join(',');
  let identifierDone = false;
  // Some ATSs hide sign-in behind a link on the posting. Open it once, and only when it is the single match on this host.
  if (!registrationStarted && profile?.entry && ['authentication', 'unknown'].includes(screen) && !await password.count() && !await visible(page.locator(userSelector).first())) {
    const entry = page.getByRole('link', { name: profile.entry }).or(page.getByRole('button', { name: profile.entry }));
    if (await entry.count() === 1) { await check(); await entry.click({ timeout: 10_000 }).catch(() => {}); await wait(800); await check(); password = page.locator('input[type="password"]:visible'); screen = await authPreflightScreen(page, { guest }); }
  }
  if (!registrationStarted) registrationStarted = await registerAccount();
  // Identifier-first sign-in: the email is asked on its own screen, then the password. No credential is submitted at this step.
  if (!registrationStarted && profile?.identifierFirst && ['authentication', 'unknown'].includes(screen) && !await password.count()) {
    if (!credentials?.username || !credentials?.password) throw pause('Add a matching ATS login in Settings, then continue.');
    const field = page.locator(userSelector);
    const next = page.getByRole('button', { name: profile.next || /^(next|continue)$/i });
    if (await field.count() !== 1 || await next.count() !== 1 || await next.isDisabled()) throw pause('The sign-in fields or control are ambiguous. Complete sign-in in the browser.');
    await check();
    try { await field.fill(credentials.username); } catch { throw pause('The saved login could not be entered. Complete sign-in in the browser.'); }
    await next.click({ timeout: 10_000 }).catch(() => { throw pause('Sign-in had an uncertain response. Inspect the employer browser before retrying.'); });
    identifierDone = true;
    for (let poll = 0; poll < 20 && !await password.count(); poll++) { await wait(500); await check(); }
    if (!await password.count()) throw pause('The employer did not ask for a password. Complete sign-in in the browser.');
  }
  if (!registrationStarted && await password.count()) {
    if (!credentials?.username || !credentials?.password) throw pause('Add a matching ATS login in Settings, then continue.');
    if (await password.count() !== 1 || await visible(page.locator('input[autocomplete="new-password"]:visible'))) throw pause('Account creation or password recovery requires your review.');
    if (account.loginAttemptAt) throw pause('This saved login was already attempted. Check the employer response or update the saved login before continuing.');
    const form = password.locator('xpath=ancestor::form[1]');
    if (await form.count() !== 1) throw pause('The sign-in form could not be identified safely. Complete sign-in in the browser.');
    const username = form.locator(userSelector);
    const button = form.getByRole('button', { name: submitName });
    if ((!identifierDone && await username.count() !== 1) || await button.count() !== 1 || await button.isDisabled()) throw pause('The sign-in fields or control are ambiguous. Complete sign-in in the browser.');
    if (await form.locator('input[type="checkbox"]:visible').count()) throw pause('Review the employer sign-in choices in the browser before continuing.');
    await check();
    try { if (!identifierDone) await username.fill(credentials.username); await password.fill(credentials.password); }
    catch { throw pause('The saved login could not be entered. Complete sign-in in the browser.'); }
    // Persist before the click so a crash cannot cause repeated login attempts or lockouts.
    account = { ...account, loginAttemptAt: new Date().toISOString() };
    await saveAccount(account);
    await check();
    await button.click({ timeout: 10_000 }).catch(() => { throw pause('Sign-in had an uncertain response. Inspect the employer browser before retrying.'); });
  }
  let codeAttempted = false;
  for (let poll = 0; poll < 30; poll++) {
    await wait(500); await check();
    const current = await authPreflightScreen(page, { guest });
    if (current === 'authenticated') { await saveAccount({ ...account, status: 'active', loginAttemptAt: null, codeAttemptAt: null }); return true; }
    if (current === 'verification' && !codeAttempted && !account.codeAttemptAt && findCode) {
      const input = page.locator('input[autocomplete="one-time-code"]:visible,input[name*="verification" i]:visible,input[name*="otp" i]:visible');
      const form = input.locator('xpath=ancestor::form[1]');
      if (await input.count() !== 1 || await form.count() !== 1) break;
      const button = form.getByRole('button', { name: /^(verify|verify code|verify email|continue)$/i });
      if (await button.count() !== 1) break;
      const code = await findCode({ since: Date.parse(account.loginAttemptAt || '') || Date.now() - 120_000 });
      if (!code) { await wait(1500); continue; }
      await check();
      await input.fill(code);
      if (await button.isDisabled()) throw pause('The verification code was entered, but the employer has not enabled verification. Review the employer browser.');
      account = { ...account, codeAttemptAt: new Date().toISOString() };
      await saveAccount(account); codeAttempted = true;
      await check(); await button.click({ timeout: 10_000 });
    }
    if (['captcha', 'password_reset'].includes(current)) break;
  }
  throw pause('Sign-in is waiting for employer verification or was not accepted. Resolve this step in the browser; Daymark will not repeat the saved login automatically.');
}

export async function signInATS(page, options) {
  try { return await runSignInATS(page, options); }
  catch (error) {
    if (error.authStatus) throw error;
    throw pause('Employer sign-in stopped. Inspect the employer browser and Proton Bridge before continuing.');
  }
}
