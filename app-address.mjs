// Per-application mailbox addresses on your own domain, like Tsenta's private inbox: job-acme-x7k2p@apply.example.com.
// Deterministic (HMAC of the job id), so nothing needs to be stored to recognise one, and a guessed address cannot be forged.
import { createHmac } from 'node:crypto';

const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const slugOf = company => String(company || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\b(?:inc|llc|ltd|corp|corporation|company|co|the)\b/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 18).replace(/-+$/g, '') || 'job';

export function validMailDomain(domain) { return DOMAIN.test(String(domain || '').toLowerCase()); }

export function applicationAddress({ domain, company, key, secret }) {
  const host = String(domain || '').toLowerCase();
  if (!validMailDomain(host)) throw new Error('MAIL_DOMAIN must be a domain name such as apply.example.com.');
  if (!secret || String(secret).length < 16) throw new Error('MAIL_ALIAS_SECRET must be at least 16 characters.');
  if (!key) throw new Error('An application key is required.');
  const tag = createHmac('sha256', String(secret)).update(String(key)).digest('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6);
  return `${slugOf(company)}-${tag}@${host}`;
}

export const addressesAtDomain = (recipients = [], domain = '') => (Array.isArray(recipients) ? recipients : []).map(item => String(item).toLowerCase()).filter(item => item.endsWith(`@${String(domain).toLowerCase()}`));
