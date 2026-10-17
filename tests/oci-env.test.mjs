import test from 'node:test';
import assert from 'node:assert/strict';
import { ociEnvFile, parseEnvText } from '../oci-env.mjs';

test('generates secrets once and keeps them on re-run', () => {
  let n = 0; const random = () => `secret${++n}`;
  const first = ociEnvFile({ tailscaleIp: '100.64.0.7', random });
  const again = ociEnvFile({ tailscaleIp: '100.64.0.7', existing: first, random });
  assert.equal(parseEnvText(first).DAYMARK_POSTGRES_PASSWORD, 'secret1');
  assert.equal(parseEnvText(again).DAYMARK_POSTGRES_PASSWORD, 'secret1');
  assert.equal(parseEnvText(again).SEARXNG_SECRET, 'secret2');
});
test('copies only the keys the OCI stack needs from the Mac env, never Bridge or ATS secrets', () => {
  const source = 'NVIDIA_API_KEY=nv\nAPPLICATION_EMAIL=a@pm.me\nPROTON_BRIDGE_PASSWORD=nope\nATS_PASSWORD=nope\n';
  const out = ociEnvFile({ tailscaleIp: '100.64.0.7', source, random: () => 'x' });
  assert.match(out, /NVIDIA_API_KEY=nv/);
  assert.doesNotMatch(out, /nope|PROTON_BRIDGE_PASSWORD|ATS_PASSWORD/);
  assert.match(out, /APPLICATION_FORWARD_MODE=summary/);
});
test('requires a Tailscale address and rejects values that could break the file', () => {
  assert.throws(() => ociEnvFile({ tailscaleIp: '203.0.113.5', mailDomain: 'apply.example.com' }), /Tailscale/);
  assert.throws(() => ociEnvFile({ tailscaleIp: '', source: '' }), /Tailscale/);
  assert.throws(() => ociEnvFile({ tailscaleIp: '100.64.0.7', source: 'NVIDIA_API_KEY=a"b' , random: () => 'x'}).includes('a'), /quotes|line breaks/);
});
test('a mail domain is optional while private mail is on hold, and validated when given', () => {
  const without = ociEnvFile({ tailscaleIp: '100.64.0.7', random: () => 'x' });
  assert.doesNotMatch(without, /MAIL_DOMAIN|MAIL_ALIAS_SECRET/);
  assert.throws(() => ociEnvFile({ tailscaleIp: '100.64.0.7', mailDomain: 'localhost' }), /MAIL_DOMAIN/);
  const withDomain = ociEnvFile({ tailscaleIp: '100.64.0.7', mailDomain: 'Apply.Example.com', random: () => 'x' });
  assert.equal(parseEnvText(withDomain).MAIL_DOMAIN, 'apply.example.com');
});
