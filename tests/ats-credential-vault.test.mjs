import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migrateLegacyCredentialVault, readCredentialVault, writeCredentialVault } from '../ats-credential-vault.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-ats-vault-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return { credentialsPath: path.join(dir, 'ats-credentials.json'), keyPath: path.join(dir, 'secrets', 'ats-credential-key') };
}

test('stores ATS passwords encrypted and reads them only through the vault', async t => {
  const files = await fixture(t);
  const credentials = { 'careers.example.test': { username: 'alex@example.test', password: 'Employer-Pass-123', updatedAt: '2026-10-19T00:00:00.000Z' } };
  await writeCredentialVault(files, credentials);
  const raw = await fs.readFile(files.credentialsPath, 'utf8');
  assert.equal(raw.includes('Employer-Pass-123'), false);
  assert.deepEqual(await readCredentialVault(files), credentials);
  assert.equal((await fs.stat(files.keyPath)).mode & 0o777, 0o600);
});

test('migrates existing private plaintext credentials when the next save occurs', async t => {
  const files = await fixture(t);
  const credentials = { default: { username: 'alex@example.test', password: 'Legacy-Pass', updatedAt: '2026-10-18T00:00:00.000Z' } };
  await fs.writeFile(files.credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
  assert.deepEqual(await readCredentialVault(files), credentials);
  await writeCredentialVault(files, credentials);
  assert.equal((await fs.readFile(files.credentialsPath, 'utf8')).includes('Legacy-Pass'), false);
  assert.deepEqual(await readCredentialVault(files), credentials);
});

test('migrates the previous Daymark credentials file before clearing it', async t => {
  const files = await fixture(t);
  const legacyPath = path.join(path.dirname(files.credentialsPath), 'legacy-ats-credentials.json');
  const credentials = { default: { username: 'alex@example.test', password: 'Legacy-Pass', updatedAt: '' } };
  await fs.writeFile(legacyPath, JSON.stringify(credentials), { mode: 0o600 });
  const result = await migrateLegacyCredentialVault({ ...files, legacyPath });
  assert.equal(result.migrated, true);
  assert.deepEqual(result.credentials, credentials);
  assert.deepEqual(await readCredentialVault(files), credentials);
  assert.deepEqual(JSON.parse(await fs.readFile(legacyPath, 'utf8')), {});
});

test('rejects altered encrypted entries instead of returning corrupt credentials', async t => {
  const files = await fixture(t);
  await writeCredentialVault(files, { default: { username: 'alex@example.test', password: 'Pass', updatedAt: '' } });
  const vault = JSON.parse(await fs.readFile(files.credentialsPath, 'utf8'));
  vault.entries.default.password.ciphertext = 'AAAA';
  await fs.writeFile(files.credentialsPath, JSON.stringify(vault), { mode: 0o600 });
  await assert.rejects(readCredentialVault(files), /could not be decrypted/i);
});
