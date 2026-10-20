import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const FORMAT = 'daymark-ats-credentials';

async function readKey(keyPath, { create = false } = {}) {
  try {
    const key = await fs.readFile(keyPath);
    if (key.length !== 32) throw new Error('The Daymark ATS credential key is invalid.');
    return key;
  } catch (error) {
    if (error.code !== 'ENOENT' || !create) throw error;
  }
  await fs.mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  const key = randomBytes(32);
  try { await fs.writeFile(keyPath, key, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return readKey(keyPath);
  }
  await fs.chmod(keyPath, 0o600);
  return key;
}

function aad(host, username) { return Buffer.from(`${host}\0${username}`); }

function decryptEntry(host, record, key) {
  const username = String(record?.username || '');
  const encrypted = record?.password;
  if (!username || !encrypted || typeof encrypted !== 'object') throw new Error('The Daymark ATS credential entry is invalid.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
    decipher.setAAD(aad(host, username));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    const password = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    return { username, password, updatedAt: String(record.updatedAt || '') };
  } catch {
    throw new Error('A saved ATS credential could not be decrypted. The credential file or key may have changed.');
  }
}

export async function readCredentialVault({ credentialsPath, keyPath }) {
  let parsed;
  try { parsed = JSON.parse(await fs.readFile(credentialsPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The Daymark ATS credential file is invalid.');
  if (parsed.format !== FORMAT || parsed.version !== 1) return parsed;
  const key = await readKey(keyPath);
  return Object.fromEntries(Object.entries(parsed.entries || {}).map(([host, record]) => [host, decryptEntry(host, record, key)]));
}

export async function writeCredentialVault({ credentialsPath, keyPath }, credentials) {
  const key = await readKey(keyPath, { create: true });
  const entries = {};
  for (const [host, record] of Object.entries(credentials || {})) {
    const username = String(record?.username || '');
    const password = String(record?.password || '');
    if (!username || !password) continue;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(host, username));
    const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    entries[host] = {
      username,
      updatedAt: String(record.updatedAt || ''),
      password: { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') },
    };
  }
  await fs.mkdir(path.dirname(credentialsPath), { recursive: true, mode: 0o700 });
  const temp = `${credentialsPath}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ format: FORMAT, version: 1, entries }, null, 2), { mode: 0o600 });
  await fs.chmod(temp, 0o600);
  await fs.rename(temp, credentialsPath);
  await fs.chmod(credentialsPath, 0o600);
}

export async function migrateLegacyCredentialVault({ legacyPath, credentialsPath, keyPath }) {
  let current = {};
  try { current = await readCredentialVault({ credentialsPath, keyPath }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (Object.keys(current).length) return { migrated: false, credentials: current };
  let legacy;
  try { legacy = await readCredentialVault({ credentialsPath: legacyPath, keyPath }); }
  catch (error) { if (error.code === 'ENOENT') return { migrated: false, credentials: current }; throw error; }
  if (!Object.keys(legacy).length) return { migrated: false, credentials: current };
  await writeCredentialVault({ credentialsPath, keyPath }, legacy);
  await fs.writeFile(legacyPath, '{}\n', { mode: 0o600 });
  await fs.chmod(legacyPath, 0o600);
  return { migrated: true, credentials: legacy };
}
