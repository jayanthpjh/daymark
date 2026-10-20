import test from 'node:test';
import assert from 'node:assert/strict';
import { protonBridgeHost } from '../proton-bridge-config.mjs';

test('Docker translates the legacy loopback default only to its allowlisted host gateway', () => {
  assert.equal(protonBridgeHost('127.0.0.1', { defaultHost: 'host.docker.internal', allowedHosts: ['host.docker.internal'] }), 'host.docker.internal');
  assert.equal(protonBridgeHost('mail.example.test', { defaultHost: 'host.docker.internal', allowedHosts: ['host.docker.internal'] }), 'mail.example.test');
});

test('native local mode keeps loopback and empty input uses the configured default', () => {
  assert.equal(protonBridgeHost('127.0.0.1'), '127.0.0.1');
  assert.equal(protonBridgeHost('', { defaultHost: 'host.docker.internal' }), 'host.docker.internal');
});
