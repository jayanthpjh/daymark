import { describe, expect, it } from 'vitest';
import { protonBridgeStatus } from '../ui-model';

describe('Proton Bridge overview status', () => {
  it('reports paused access when the Docker deployment has mail automation disabled', () => {
    expect(protonBridgeStatus({ integrations: { proton: false }, mailForwarding: { paused: true } })).toMatchObject({
      label: 'Paused',
      tone: 'warning',
    });
  });

  it('reports configured credentials separately from a live connection check', () => {
    expect(protonBridgeStatus({ integrations: { proton: true }, mailForwarding: { paused: false } })).toMatchObject({
      label: 'Configured',
      tone: 'success',
    });
  });

  it('reports missing credentials when access is neither configured nor intentionally paused', () => {
    expect(protonBridgeStatus({ integrations: { proton: false }, mailForwarding: { paused: false } })).toMatchObject({
      label: 'Not configured',
      tone: 'warning',
    });
  });
});
