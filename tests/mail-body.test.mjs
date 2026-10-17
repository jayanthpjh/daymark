import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMailText, extractVerificationCode } from '../mail-body.mjs';
import { classifyMail } from '../public/mail-model.js';

test('extracts readable text and verification codes from HTML-only mail', () => {
  const html = '<html><head><style>.hidden{display:none}</style></head><body><p>Your Cloudflare security code is:</p><h1>482913</h1><p>Enter it to continue &amp; verify your email.</p><script>console.log("ignore")</script></body></html>';
  const text = extractMailText('', html);

  assert.match(text, /Your Cloudflare security code is:/);
  assert.match(text, /482913/);
  assert.match(text, /continue & verify your email/);
  assert.doesNotMatch(text, /console\.log|\.hidden/);
  assert.equal(extractVerificationCode(text), '482913');
});

test('detects Greenhouse alphanumeric security codes and classifies the message as verification', () => {
  const text = 'Copy and paste this code into the security code field on your application:\n\n#CKDOJO#\n\nAfter you enter the code, resubmit your application.';
  assert.equal(extractVerificationCode(text), 'CKDOJO');
  assert.deepEqual(classifyMail({ subject: 'Security code for your application to Cloudflare', text }), ['Verification']);
});

test('prefers plain text and does not infer codes from markup or unrelated six-digit values', () => {
  assert.equal(extractMailText('Use code 123456 now', '<p>Other code 999999</p>'), 'Use code 123456 now');
  assert.equal(extractVerificationCode('Your application ID is 805511 and was received at 20261006.'), '');
});

test('returns empty text for empty or script-only HTML', () => {
  assert.equal(extractMailText('', ''), '');
  assert.equal(extractMailText('', '<script>var code = "123456";</script><style>.a{}</style>'), '');
});

test('preserves case of HTML-only verification codes through MIME parsing', async () => {
  const { simpleParser } = await import('mailparser');
  const raw = 'From: verification@us.greenhouse-mail.io\r\nTo: candidate@example.test\r\nSubject: Security code for your application to Example\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Copy and paste this code into the security code field on your application:</p><h2>aB3dE5gH</h2>';
  const parsed = await simpleParser(raw, { skipHtmlToText: true, skipTextToHtml: true });
  assert.equal(extractVerificationCode(extractMailText(parsed.text, parsed.html)), 'aB3dE5gH');
});
