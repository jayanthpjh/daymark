import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardedMessageOptions, forwardingCursor, isApplicationMail, forwardCategories } from '../mail-forwarding.mjs';

test('only forwards messages classified as application mail', () => {
  assert.equal(isApplicationMail(['Interview']), true);
  assert.equal(isApplicationMail(['Other']), false);
  assert.equal(isApplicationMail(['Other', 'Application update']), false, 'updates are not forwarded by default');
  assert.equal(isApplicationMail(['Other', 'Application update'], ['Application update']), true);
  assert.equal(isApplicationMail([]), false);
});

test('mailbox cursor starts at the current newest UID and resets on UIDVALIDITY change', () => {
  assert.deepEqual(forwardingCursor({ cursor: null, uidValidity: 51, uidNext: 900 }), { reset: true, uidValidity: '51', lastUid: 899 });
  assert.deepEqual(forwardingCursor({ cursor: { uidValidity: '51', lastUid: 899 }, uidValidity: 51, uidNext: 904 }), { reset: false, uidValidity: '51', lastUid: 899 });
  assert.deepEqual(forwardingCursor({ cursor: { uidValidity: '50', lastUid: 800 }, uidValidity: 51, uidNext: 904 }), { reset: true, uidValidity: '51', lastUid: 903 });
});

test('creates a plain-text forwarded message and preserves bounded attachments', () => {
  const file = Buffer.from('fixture');
  const options = forwardedMessageOptions({
    recipient: 'jayanth@example.com', sender: 'apply@example.com',
    message: { subject: 'Interview next week', from: 'Recruiter <r@example.com>', date: 'Oct 5', text: 'Hello\nWhen can you meet?', html: '<img src="tracker">', attachments: [{ filename: 'role.pdf', content: file, contentType: 'application/pdf' }] },
  });
  assert.equal(options.to, 'jayanth@example.com');
  assert.deepEqual(options.from, { name: 'Daymark', address: 'apply@example.com' });
  assert.match(options.subject, /^Fwd: Interview/);
  assert.match(options.text, /Recruiter <r@example.com>/);
  assert.match(options.text, /When can you meet\?/);
  assert.doesNotMatch(options.text, /tracker/);
  assert.equal(options.attachments[0].content, file);
  assert.throws(() => forwardedMessageOptions({ recipient: 'bad', sender: 'sender', message: {} }), /valid forwarding address/);
  assert.throws(() => forwardedMessageOptions({ recipient: 'j@example.com', sender: 's@example.com', maxAttachmentBytes: 1, message: { attachments: [{ content: file }] } }), /attachment limit/);
});

test('verification and password-reset mail never leaves the mailbox, even when allow-listed', () => {
  assert.equal(isApplicationMail(['Verification']), false);
  assert.equal(isApplicationMail(['Interview', 'Verification']), false);
  assert.equal(isApplicationMail(['Password reset'], ['Password reset']), false);
  assert.deepEqual(forwardCategories('Interview, Verification, Bogus'), ['Interview']);
  assert.deepEqual(forwardCategories(''), ['Assessment', 'Screening', 'Interview', 'Offer', 'Rejection']);
});

test('summary mode sends a short digest with links and no attachments or full body', () => {
  const long = 'Hi Alex, we would love to schedule a call. '.repeat(30) + ' Book here: https://calendly.com/x/30min.';
  const options = forwardedMessageOptions({ recipient: 'me@example.com', sender: 'apply@example.com', mode: 'summary',
    message: { subject: 'Interview invite', from: 'R <r@example.com>', date: 'Oct 5', text: long, categories: ['Interview'], attachments: [{ filename: 'a.pdf', content: Buffer.from('x') }] } });
  assert.match(options.subject, /^Daymark: Interview · Interview invite/);
  assert.ok(options.text.length < long.length);
  assert.match(options.text, /Reply from the application address/);
  assert.deepEqual(options.attachments, []);
});
