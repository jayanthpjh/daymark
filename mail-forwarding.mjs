import { mailCategories } from './public/mail-model.js';

const safeHeader = (value, limit = 500) => String(value || '').replace(/[\r\n\0]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);

// Only mail that needs a human decision leaves the application mailbox. Codes and password resets never do.
export const DEFAULT_FORWARD_CATEGORIES = Object.freeze(['Assessment', 'Screening', 'Interview', 'Offer', 'Rejection']);
export const NEVER_FORWARD_CATEGORIES = Object.freeze(['Verification', 'Password reset']);

export function forwardCategories(value) {
  const wanted = String(value || '').split(',').map(item => item.trim()).filter(item => mailCategories.includes(item) && !NEVER_FORWARD_CATEGORIES.includes(item));
  return wanted.length ? wanted : [...DEFAULT_FORWARD_CATEGORIES];
}

export function isApplicationMail(categories = [], allow = DEFAULT_FORWARD_CATEGORIES) {
  if (!Array.isArray(categories) || categories.some(category => NEVER_FORWARD_CATEGORIES.includes(category))) return false;
  return categories.some(category => allow.includes(category));
}

export function forwardingCursor({ cursor, uidValidity, uidNext }) {
  const validity = String(uidValidity || '');
  const next = Math.max(1, Number(uidNext) || 1);
  if (!validity || !Number.isSafeInteger(Number(uidValidity))) return { reset: true, uidValidity: validity, lastUid: next - 1 };
  if (!cursor || String(cursor.uidValidity) !== validity || !Number.isSafeInteger(Number(cursor.lastUid))) {
    return { reset: true, uidValidity: validity, lastUid: next - 1 };
  }
  return { reset: false, uidValidity: validity, lastUid: Math.min(Number(cursor.lastUid), next - 1) };
}

export function forwardedMessageOptions({ message, recipient, sender, maxAttachmentBytes = 20 * 1024 * 1024, mode = 'full' }) {
  const to = safeHeader(recipient, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('Set a valid forwarding address in Settings.');
  const from = safeHeader(sender, 254);
  const subject = safeHeader(message?.subject || 'No subject', 300);
  const attachments = (message?.attachments || []).filter(item => Buffer.isBuffer(item.content) && item.content.length > 0);
  const attachmentBytes = attachments.reduce((sum, item) => sum + item.content.length, 0);
  if (attachmentBytes > maxAttachmentBytes) throw new Error('This email exceeds the configured attachment limit of 20 MB.');
  if (mode === 'summary') {
    const body = String(message?.text || '');
    const links = [...new Set([...body.matchAll(/https:\/\/[^\s<>"')]+/g)].map(match => match[0].replace(/[.,;]+$/, '')))].slice(0, 3);
    const category = (message?.categories || []).filter(item => mailCategories.includes(item) && item !== 'Other')[0] || 'Application mail';
    return {
      from: { name: 'Daymark', address: from },
      to,
      subject: `Daymark: ${category} · ${subject}`.slice(0, 320),
      text: [
        `${category}: ${subject}`,
        `From: ${safeHeader(message?.from, 500) || 'Unknown sender'}`,
        `Date: ${safeHeader(message?.date, 100) || 'Date unavailable'}`,
        '',
        body.replace(/\s+/g, ' ').trim().slice(0, 280),
        ...(links.length ? ['', 'Links:', ...links] : []),
        '',
        'Open the full message in Daymark. Reply from the application address there, not from this inbox.',
      ].join('\n'),
      attachments: [],
    };
  }
  const text = [
    'Forwarded application email',
    `From: ${safeHeader(message?.from, 500) || 'Unknown sender'}`,
    `Date: ${safeHeader(message?.date, 100) || 'Date unavailable'}`,
    `Subject: ${subject}`,
    '',
    String(message?.text || '').slice(0, 100_000),
  ].join('\n');
  return {
    from: { name: 'Daymark', address: from },
    to,
    subject: `Fwd: ${subject}`.slice(0, 320),
    text,
    attachments: attachments.map(item => ({
      filename: safeHeader(item.filename || 'attachment', 180) || 'attachment',
      content: item.content,
      contentType: safeHeader(item.contentType || 'application/octet-stream', 120),
      contentDisposition: 'attachment',
    })),
  };
}
