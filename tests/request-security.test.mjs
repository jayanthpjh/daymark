import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSecurityError } from '../request-security.mjs';

const request = (headers = {}, method = 'GET') => ({ method, headers: { host: '127.0.0.1:4173', ...headers } });

test('allows local reads and same-origin browser mutations', () => {
  assert.equal(requestSecurityError(request(), 4173), '');
  assert.equal(requestSecurityError(request({ origin: 'http://127.0.0.1:4173', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, 'POST'), 4173), '');
});

test('allows local CLI JSON mutations without browser origin headers', () => {
  assert.equal(requestSecurityError(request({ 'content-type': 'application/json' }, 'POST'), 4173), '');
});

test('rejects DNS rebinding, foreign origins, cross-site fetches and simple content types', () => {
  assert.equal(requestSecurityError(request({ host: 'attacker.example:4173' }), 4173), 'host');
  assert.equal(requestSecurityError(request({ origin: 'https://attacker.example', 'content-type': 'application/json' }, 'POST'), 4173), 'origin');
  assert.equal(requestSecurityError(request({ 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, 'POST'), 4173), 'origin');
  assert.equal(requestSecurityError(request({ 'content-type': 'text/plain' }, 'POST'), 4173), 'content-type');
});

test('requires the expected local port and allows Compose service hostnames', () => {
  assert.equal(requestSecurityError(request({ host: 'localhost:4174' }), 4173), 'host');
  assert.equal(requestSecurityError(request({ host: 'daymark-api:4173' }), 4173), '');
});
