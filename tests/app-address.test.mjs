import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationAddress, validMailDomain, addressesAtDomain } from '../app-address.mjs';
import { routeMessage } from '../mail-routing.mjs';

const secret = 'a-long-random-secret-value';
test('addresses are deterministic, readable, unique per application, and not guessable without the secret', () => {
  const a = applicationAddress({ domain: 'apply.example.com', company: 'Acme, Inc.', key: 'job-1', secret });
  assert.equal(a, applicationAddress({ domain: 'APPLY.example.com', company: 'Acme, Inc.', key: 'job-1', secret }));
  assert.match(a, /^acme-[a-z0-9]{6}@apply\.example\.com$/);
  assert.notEqual(a, applicationAddress({ domain: 'apply.example.com', company: 'Acme, Inc.', key: 'job-2', secret }));
  assert.notEqual(a, applicationAddress({ domain: 'apply.example.com', company: 'Acme, Inc.', key: 'job-1', secret: 'another-long-random-secret' }));
  assert.match(applicationAddress({ domain: 'apply.example.com', company: '', key: 'k', secret }), /^job-/);
});
test('rejects bad domains, short secrets and missing keys', () => {
  assert.equal(validMailDomain('apply.example.com'), true);
  for (const bad of ['', 'localhost', 'a b.com', 'x@y.com', 'http://x.com']) assert.equal(validMailDomain(bad), false);
  assert.throws(() => applicationAddress({ domain: 'bad', company: 'a', key: 'k', secret }), /MAIL_DOMAIN/);
  assert.throws(() => applicationAddress({ domain: 'a.example.com', company: 'a', key: 'k', secret: 'short' }), /MAIL_ALIAS_SECRET/);
  assert.throws(() => applicationAddress({ domain: 'a.example.com', company: 'a', key: '', secret }), /application key/);
});
test('mail sent to an application address routes straight to that application', () => {
  const apps = [{ id: 'a1', jobId: 'j1', company: 'Acme', status: 'submitted', mailAddress: 'acme-abc123@apply.example.com' }, { id: 'a2', jobId: 'j2', company: 'Globex', status: 'submitted', mailAddress: 'globex-zzz999@apply.example.com' }];
  const mail = { subject: 'Hello', text: 'no company named here', recipients: ['globex-zzz999@apply.example.com'], senderAddress: 'x@y.com' };
  assert.deepEqual(routeMessage(mail, apps, [], { addressDomain: 'apply.example.com' }), { applicationId: 'a2', jobId: 'j2', confidence: 1, why: ['application address'] });
  assert.equal(routeMessage({ ...mail, recipients: ['other@apply.example.com'] }, apps, [], { addressDomain: 'apply.example.com' }), null);
  assert.deepEqual(addressesAtDomain(['A@apply.example.com', 'b@other.com'], 'apply.example.com'), ['a@apply.example.com']);
});
