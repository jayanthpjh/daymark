import { convert } from 'html-to-text';

const codeContext = /\b(?:security|verification|verify|one[ -]?time|passcode|authentication|sign[ -]?in)\b/i;

export function extractMailText(plainText, html) {
  const plain = String(plainText || '').replace(/\r\n?/g, '\n').trim();
  const source = plain || (typeof html === 'string' ? convert(html, {
    wordwrap: false,
    selectors: [
      // Codes in headings/table headers are case-sensitive, not display typography.
      ...['h1','h2','h3','h4','h5','h6'].map(selector => ({ selector, options: { uppercase: false } })),
      { selector: 'table', options: { uppercaseHeaderCells: false } },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'head', format: 'skip' },
      { selector: 'img', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
    ],
  }) : '');
  return source.replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 60_000);
}

export function extractVerificationCode(text) {
  const body = String(text || '');
  const explicit = body.match(/\b(?:security|verification|one[ -]?time|authentication|passcode|copy and paste this)\s+(?:code|passcode)\b[\s\S]{0,160}?:\s*[#*]?([A-Z0-9]{4,10})[#*]?(?=\s|$)/i);
  if (explicit) return explicit[1];
  const named = body.match(/\b(?:security|verification|one[ -]?time|passcode|authentication)\s+(?:code|passcode)\D{0,50}(\d{6})\b/i)
    || body.match(/\b(?:code|passcode)\D{0,30}(\d{6})\b/i);
  if (named) return named[1];

  if (!codeContext.test(body)) return '';
  const values = [...body.matchAll(/\b(\d{6})\b/g)].map(match => match[1]);
  return values.length === 1 ? values[0] : '';
}
