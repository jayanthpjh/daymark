// Builds the private .env.oci for the OCI deployment. Pure so it can be tested; scripts/setup-oci.mjs does the file I/O.
import { randomBytes } from 'node:crypto';

const ip = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const safe = value => { const text = String(value ?? ''); if (/[\r\n"']/.test(text)) throw new Error('Environment values cannot contain quotes or line breaks.'); return text; };

export function parseEnvText(text = '') {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const i = line.indexOf('='); if (!line || line.startsWith('#') || i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

export function ociEnvFile({ tailscaleIp, mailDomain = '', uid = 1000, gid = 1000, existing = '', source = '', random = () => randomBytes(32).toString('base64url') } = {}) {
  if (!ip.test(String(tailscaleIp || '')) || !String(tailscaleIp).startsWith('100.')) throw new Error('TAILSCALE_IP must be this machine\'s Tailscale IPv4 address (100.x.x.x).');
  const old = parseEnvText(existing), src = parseEnvText(source);
  // Private mail on your own domain is on hold; MAIL_DOMAIN is only written when you set one.
  const domain = String(mailDomain || old.MAIL_DOMAIN || '').toLowerCase();
  if (domain && !/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) throw new Error('MAIL_DOMAIN must be a domain name such as apply.example.com.');
  const pick = key => safe(old[key] || src[key] || '');
  const lines = [
    '# Private OCI environment. Do not commit this file.',
    `TAILSCALE_IP=${tailscaleIp}`,
    `DAYMARK_UID=${Number(uid)}`,
    `DAYMARK_GID=${Number(gid)}`,
    `DAYMARK_POSTGRES_PASSWORD=${old.DAYMARK_POSTGRES_PASSWORD || random()}`,
    `SEARXNG_SECRET=${old.SEARXNG_SECRET || random()}`,
    `DAYMARK_MCP_TOKEN=${old.DAYMARK_MCP_TOKEN || random()}`,
    ...(domain ? [`MAIL_DOMAIN=${domain}`, `MAIL_ALIAS_SECRET=${old.MAIL_ALIAS_SECRET || random()}`] : []),
    `NVIDIA_API_KEY=${pick('NVIDIA_API_KEY')}`,
    `APIFY_API_TOKEN=${pick('APIFY_API_TOKEN')}`,
    `APPLICATION_EMAIL=${pick('APPLICATION_EMAIL')}`,
    `PROTON_BRIDGE_USER=${pick('PROTON_BRIDGE_USER')}`,
    `APPLICATION_FORWARD_ENABLED=${pick('APPLICATION_FORWARD_ENABLED') || 'false'}`,
    `APPLICATION_FORWARD_TO=${pick('APPLICATION_FORWARD_TO')}`,
    `APPLICATION_FORWARD_MODE=${pick('APPLICATION_FORWARD_MODE') || 'summary'}`,
    `NVIDIA_MODEL=${pick('NVIDIA_MODEL') || 'nvidia/nemotron-3-super-120b-a12b'}`,
    `NVIDIA_RPM=${pick('NVIDIA_RPM') || '10'}`,
    `LLM_HOSTED_ENABLED=${pick('LLM_HOSTED_ENABLED') || 'false'}`,
    `MAC_BRIDGE_TAILSCALE_HOST=${pick('MAC_BRIDGE_TAILSCALE_HOST')}`,
  ];
  return `${lines.join('\n')}\n`;
}
