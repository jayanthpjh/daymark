// Greenhouse (and some embedded boards) ask for an emailed security code right after Submit. The code field is
// either one box per character (legacy security_input_0..7 or current security-input-0..7) or a single labelled input. Daymark fills it once with a
// code from the matched employer email; it never guesses a code and never repeats a failed attempt.

const surfacesOf = page => { try { const frames = typeof page.frames === 'function' ? page.frames() : []; return frames.length ? frames : [page]; } catch { return [page]; } };
const SPLIT_BOXES = 'input[id^="security_input"],input[id^="security-input-"]';
const SINGLE_BOX = 'input[autocomplete="one-time-code"],input[name*="security" i][name*="code" i],input[id*="security" i][id*="code" i],input[aria-label*="security code" i]';
export const SECURITY_SUBMIT = /^(Submit|Submit application|Verify|Verify code|Continue)$/i;

async function visibleInputs(surface, selector) {
  const all = surface.locator(selector);
  const found = [];
  for (let i = 0; i < await all.count().catch(() => 0); i++) if (await all.nth(i).isVisible().catch(() => false)) found.push(all.nth(i));
  return found;
}

// Returns {surface, inputs} when a security-code prompt is visible, otherwise null.
export async function detectSecurityCodeStep(page) {
  for (const surface of surfacesOf(page)) {
    const split = await visibleInputs(surface, SPLIT_BOXES);
    if (split.length) return { surface, inputs: split };
    const single = await visibleInputs(surface, SINGLE_BOX);
    if (single.length === 1) return { surface, inputs: single };
  }
  return null;
}

export async function fillSecurityCode(step, code) {
  const value = String(code || '').trim();
  if (!/^[A-Za-z0-9]{4,10}$/.test(value)) throw new Error('The security code was not in the expected format.');
  if (step.inputs.length > 1) {
    if (step.inputs.length !== value.length) throw new Error('The security code length did not match the employer form.');
    for (let i = 0; i < value.length; i++) await step.inputs[i].fill(value[i]);
    const actual = (await Promise.all(step.inputs.map(input => input.inputValue().catch(() => '')))).join('');
    return actual === value;
  }
  await step.inputs[0].fill(value);
  return (await step.inputs[0].inputValue().catch(() => '')) === value;
}

// The single visible verify/submit control for the code step, or null when it is ambiguous.
export async function securityCodeButton(step) {
  const buttons = step.surface.getByRole('button', { name: SECURITY_SUBMIT });
  const visible = [];
  for (let i = 0; i < await buttons.count().catch(() => 0); i++) if (await buttons.nth(i).isVisible().catch(() => false)) visible.push(buttons.nth(i));
  return visible.length === 1 ? visible[0] : null;
}
