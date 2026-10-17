// Secret storage with two backends: the macOS Keychain (default on a Mac) and owner-only files
// (Docker secrets under /run/secrets, or a private directory) for the OCI deployment.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9@._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);

export function secretBackend(env = process.env, platform = process.platform) {
  const wanted = env.DAYMARK_SECRET_BACKEND;
  if (wanted && !['keychain', 'file'].includes(wanted)) throw new Error('DAYMARK_SECRET_BACKEND must be keychain or file.');
  return wanted || (platform === 'darwin' ? 'keychain' : 'file');
}

export function secretFileName(service, account) {
  const name = `${slug(service)}__${slug(account)}`;
  if (!slug(service) || !slug(account)) throw new Error('A secret needs a service and an account.');
  return name;
}

export function createSecretStore({ backend = secretBackend(), dir = process.env.DAYMARK_SECRETS_DIR || '/run/secrets', exec = execFileAsync } = {}) {
  if (backend === 'keychain') {
    return {
      backend,
      async get(service, account) {
        try { const { stdout } = await exec('security', ['find-generic-password', '-s', service, '-a', account, '-w'], { timeout: 5000 }); return stdout.trim(); }
        catch { return ''; }
      },
      async set(service, account, value) { await exec('security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', value]); },
    };
  }
  if (backend !== 'file') throw new Error('Unknown secret backend.');
  const file = (service, account) => path.join(dir, secretFileName(service, account));
  return {
    backend,
    async get(service, account) {
      try { return (await fs.readFile(file(service, account), 'utf8')).replace(/\r?\n$/, ''); } catch { return ''; }
    },
    async set(service, account, value) {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const target = file(service, account);
      const temp = `${target}.${process.pid}.tmp`;
      await fs.writeFile(temp, String(value), { mode: 0o600 });
      await fs.rename(temp, target);
    },
  };
}
