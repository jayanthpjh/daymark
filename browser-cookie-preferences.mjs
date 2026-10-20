const safeChoices = [
  /^(?:reject|decline) (?:all )?(?:optional|non[- ]?essential) cookies?$/i,
  /^(?:only|accept only) (?:necessary|essential) cookies?$/i,
  /^(?:necessary|essential) cookies? only$/i,
  /^(?:reject|decline) all cookies?$/i,
  /^(?:necessary|essential) only$/i,
];

const promptSelector = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [id*="cookie" i], [class*="cookie" i], [data-testid*="cookie" i]';

async function promptDetails(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const inViewport = rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    return {
      text: element.innerText || '',
      role: element.getAttribute('role') || '',
      modal: element.getAttribute('aria-modal') === 'true',
      position: style.position,
      inViewport,
    };
  }).catch(() => null);
}

async function choiceIsInViewport(locator) {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
  }).catch(() => false);
}

export async function handleCookiePreferences(page) {
  const prompts = page.locator(promptSelector);
  const count = await prompts.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 12); index++) {
    const prompt = prompts.nth(index);
    if (!await prompt.isVisible().catch(() => false)) continue;
    const details = await promptDetails(prompt);
    if (!details || !details.inViewport || !/cookie|privacy preference|consent management/i.test(details.text)) continue;
    const isOverlay = details.role === 'dialog' || details.role === 'alertdialog' || details.modal || ['fixed', 'sticky'].includes(details.position);
    if (!isOverlay) continue;

    for (const name of safeChoices) {
      const button = prompt.getByRole('button', { name });
      const matches = await button.count().catch(() => 0);
      if (matches !== 1) continue;
      const candidate = button.nth(0);
      if (!await candidate.isVisible().catch(() => false) || !await choiceIsInViewport(candidate)) continue;
      await candidate.click();
      return 'handled';
    }
    return 'needs_user';
  }
  return 'none';
}
