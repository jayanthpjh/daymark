// Verify the actual MyGreenhouse session in the same browser context as the form.
// Employer forms do not expose account navigation, even after account autofill.
export async function greenhouseAccountVerified(page, email) {
  let probe;
  try {
    const host = new URL(page.url()).hostname;
    if (!/^(?:job-boards|boards)\.greenhouse\.io$/.test(host) || !email) return false;
    probe = await page.context().newPage();
    await probe.goto('https://my.greenhouse.io/profile', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await probe.getByText(String(email).trim(), { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 });
    const url = new URL(probe.url());
    if (url.origin !== 'https://my.greenhouse.io' || url.pathname !== '/profile') return false;
    const body = await probe.locator('body').innerText();
    return body.toLowerCase().includes(String(email).trim().toLowerCase()) && /contact info(?:rmation)?/i.test(body);
  } catch { return false; }
  finally { if (probe) await probe.close().catch(() => {}); }
}
