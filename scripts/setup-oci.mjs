// Run on the OCI VM: node scripts/setup-oci.mjs [path-to-copied-mac-env]
// Writes .env.oci (0600) and prepares /srv/daymark. Bridge and ATS secrets are never copied from the Mac env.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ociEnvFile } from '../oci-env.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, '.env.oci');
const base = '/srv/daymark';
const tailscaleIp = process.env.TAILSCALE_IP || execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim().split(/\s+/)[0];
const existing = await fs.readFile(envPath, 'utf8').catch(() => '');
const source = process.argv[2] ? await fs.readFile(process.argv[2], 'utf8') : '';
const content = ociEnvFile({ tailscaleIp, mailDomain: process.env.MAIL_DOMAIN, uid: process.getuid(), gid: process.getgid(), existing, source });
const temp = `${envPath}.${process.pid}.tmp`;
await fs.writeFile(temp, content, { mode: 0o600 });
await fs.rename(temp, envPath);
for (const dir of ['postgres', 'redis', 'bridge', 'ollama', 'searxng', 'data', 'data/worker-control', 'data/docker-browser-profile', 'secrets', 'backups']) {
  await fs.mkdir(path.join(base, dir), { recursive: true, mode: 0o700 }).catch(error => { throw new Error(`Cannot create ${base}/${dir}: ${error.message}. Mount the block volume at ${base} first (see docs/oci-deploy.md).`); });
}
const creds = path.join(base, 'secrets', 'daymark-ats-credentials');
await fs.writeFile(creds, '{}\n', { mode: 0o600, flag: 'wx' }).catch(() => {});
console.log(`Wrote ${envPath} for Tailscale address ${tailscaleIp}. Next: docker compose --env-file .env.oci -f docker-compose.oci.yml up -d --build`);
