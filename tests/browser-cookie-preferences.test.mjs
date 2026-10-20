import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCookiePreferences } from '../browser-cookie-preferences.mjs';

function pageFixture({ buttons = [], promptText = '', promptPosition = 'fixed', promptInViewport = true } = {}) {
  const clicks = [];
  return {
    clicks,
    getByRole(role, { name } = {}) {
      const matches = role === 'button' ? buttons.filter(item => name.test(item.name)) : [];
      return {
        count: async () => matches.length,
        nth: index => ({
          isVisible: async () => matches[index]?.visible !== false && Boolean(matches[index]),
          click: async () => clicks.push(matches[index]?.name),
        }),
      };
    },
    locator(selector) {
      const matches = selector.includes('cookie') && promptText ? [{ text: promptText }] : [];
      return {
        count: async () => matches.length,
        nth: index => ({
          isVisible: async () => Boolean(matches[index]),
          innerText: async () => matches[index]?.text || '',
          evaluate: async () => ({
            text: matches[index]?.text || '',
            role: matches[index]?.role || '',
            ariaModal: matches[index]?.ariaModal || '',
            position: matches[index]?.position || promptPosition,
            inViewport: matches[index]?.inViewport ?? promptInViewport,
          }),
          getByRole: (nestedRole, { name } = {}) => {
            const nested = nestedRole === 'button' ? buttons.filter(item => name.test(item.name) && (!item.prompt || item.prompt === matches[index]?.text)) : [];
            return {
              count: async () => nested.length,
              nth: nestedIndex => ({
                isVisible: async () => nested[nestedIndex]?.visible !== false && Boolean(nested[nestedIndex]),
                evaluate: async () => ({ inViewport: nested[nestedIndex]?.inViewport !== false }),
                click: async () => clicks.push(nested[nestedIndex]?.name),
              }),
            };
          },
        }),
      };
    },
  };
}

test('selects only necessary cookies when the site offers that explicit choice', async () => {
  const page = pageFixture({ buttons: [{ name: 'Accept all cookies' }, { name: 'Only necessary cookies', visible: true }], promptText: 'Cookie preferences' });
  assert.equal(await handleCookiePreferences(page), 'handled');
  assert.deepEqual(page.clicks, ['Only necessary cookies']);
});

test('rejects optional cookies when that explicit choice is available', async () => {
  const page = pageFixture({ buttons: [{ name: 'Reject optional cookies' }], promptText: 'We use cookies to improve your experience' });
  assert.equal(await handleCookiePreferences(page), 'handled');
  assert.deepEqual(page.clicks, ['Reject optional cookies']);
});

test('never accepts all cookies when no narrow privacy choice is available', async () => {
  const page = pageFixture({ buttons: [{ name: 'Accept all cookies' }], promptText: 'Cookie settings' });
  assert.equal(await handleCookiePreferences(page), 'needs_user');
  assert.deepEqual(page.clicks, []);
});

test('leaves pages without a visible cookie prompt alone', async () => {
  const page = pageFixture();
  assert.equal(await handleCookiePreferences(page), 'none');
  assert.deepEqual(page.clicks, []);
});

test('ignores cookie copy in a normal page section outside the viewport', async () => {
  const page = pageFixture({ promptText: 'Cookie preferences', promptPosition: 'static', promptInViewport: false });
  assert.equal(await handleCookiePreferences(page), 'none');
});
