import { describe, it, expect } from 'vitest';
import type { NormalizedQueue, PrinterChoice } from '@shared/contracts';
import {
  isUnsupportedTransport,
  queueIdentityFingerprint,
  selectQueueForProfile,
  resolveQueueSelection,
} from '@shared/printerSelection';

function queue(overrides: Partial<NormalizedQueue> & { deviceName: string }): NormalizedQueue {
  return {
    displayName: overrides.deviceName,
    isDefault: false,
    model: '',
    driver: 'Driver',
    port: 'USB001',
    transport: 'usb',
    status: 'ready',
    profile: null,
    requiresManualConfirmation: false,
    queryTimestamp: 0,
    ...overrides,
  };
}

function choice(q: NormalizedQueue, overrides: Partial<PrinterChoice> = {}): PrinterChoice {
  return {
    deviceName: q.deviceName,
    platform: 'win32',
    identityFingerprint: queueIdentityFingerprint(q),
    manualProfileConfirmed: false,
    usbConfirmed: true,
    ...overrides,
  };
}

describe('selectQueueForProfile', () => {
  const sp410 = queue({ deviceName: 'iDPRT SP410BT', profile: '4x6' });
  const sp310Unknown = queue({
    deviceName: 'iDPRT SP310',
    profile: '2x1',
    port: 'COM5',
    transport: 'unknown',
    requiresManualConfirmation: true,
  });
  const renamed = queue({ deviceName: 'Label Printer', profile: null, requiresManualConfirmation: true });

  it('auto-selects a detected USB queue for its own profile only', () => {
    expect(selectQueueForProfile([sp410, sp310Unknown], '4x6', null)?.deviceName).toBe('iDPRT SP410BT');
    expect(selectQueueForProfile([sp410], '2x1', null)).toBeNull();
  });

  it('does not auto-select a queue whose connection type is unknown', () => {
    expect(selectQueueForProfile([sp310Unknown], '2x1', null)).toBeNull();
  });

  it('honors a USB confirmation the user saved for a queue with unknown transport', () => {
    const selected = selectQueueForProfile([sp310Unknown], '2x1', choice(sp310Unknown));
    expect(selected?.deviceName).toBe('iDPRT SP310');
    expect(selected?.requiresManualConfirmation).toBe(false);
  });

  it('voids the confirmation when the driver or port changed', () => {
    const saved = choice(sp310Unknown);
    const changed = { ...sp310Unknown, driver: 'Different Driver' };
    expect(selectQueueForProfile([changed], '2x1', saved)).toBeNull();
  });

  it('honors a confirmed override for a renamed queue, but only with a matching fingerprint', () => {
    const saved = choice(renamed, { manualProfileConfirmed: true });
    expect(selectQueueForProfile([renamed], '2x1', saved)?.profile).toBe('2x1');
    expect(selectQueueForProfile([{ ...renamed, port: 'USB009' }], '2x1', saved)).toBeNull();
  });

  it('never assigns an unidentified queue without a saved override', () => {
    expect(selectQueueForProfile([renamed], '4x6', null)).toBeNull();
    expect(selectQueueForProfile([renamed], '4x6', choice(renamed))).toBeNull();
  });

  it('never uses a queue assigned to the other profile, even if it was saved', () => {
    expect(selectQueueForProfile([sp410], '2x1', choice(sp410, { manualProfileConfirmed: true }))).toBeNull();
  });

  it('never selects Bluetooth or network queues', () => {
    const bluetooth = queue({ deviceName: 'SP410 BT', profile: '4x6', port: 'BTH001', transport: 'bluetooth', requiresManualConfirmation: true });
    expect(selectQueueForProfile([bluetooth], '4x6', choice(bluetooth))).toBeNull();
    expect(isUnsupportedTransport('bluetooth')).toBe(true);
    expect(isUnsupportedTransport('network')).toBe(true);
    expect(isUnsupportedTransport('usb')).toBe(false);
    expect(isUnsupportedTransport('unknown')).toBe(false);
  });
});

describe('resolveQueueSelection', () => {
  const sp410 = queue({ deviceName: 'iDPRT SP410BT', profile: '4x6' });
  const spare = queue({ deviceName: 'Second SP410', profile: '4x6', port: 'USB005' });

  it('keeps a saved choice that has disappeared and does not substitute another printer', () => {
    const saved = choice(queue({ deviceName: 'Old SP410', profile: '4x6' }));
    const result = resolveQueueSelection([sp410, spare], '4x6', saved);
    expect(result.queue).toBeNull();
    expect(result.savedProblem).toEqual({ deviceName: 'Old SP410', kind: 'missing' });
  });

  it('flags a saved choice that is present but cannot be used', () => {
    const unknownTransport = queue({
      deviceName: 'iDPRT SP310',
      profile: '2x1',
      port: 'COM5',
      transport: 'unknown',
      requiresManualConfirmation: true,
    });
    const saved = choice(unknownTransport, { identityFingerprint: 'stale' });
    expect(resolveQueueSelection([unknownTransport], '2x1', saved).savedProblem).toEqual({
      deviceName: 'iDPRT SP310',
      kind: 'unusable',
    });
  });

  it('still auto-selects when nothing was ever saved', () => {
    const result = resolveQueueSelection([sp410, spare], '4x6', null);
    expect(result.queue?.deviceName).toBe('iDPRT SP410BT');
    expect(result.savedProblem).toBeNull();
  });

  it('keeps a detected USB queue selected when its driver string changed or the saved fingerprint is empty', () => {
    // Settings written by an early build stored "::" as the fingerprint.
    const saved = choice(sp410, { identityFingerprint: '::' });
    const reinstalled = { ...sp410, driver: 'iDPRT SP410BT (v2)' };
    const result = resolveQueueSelection([reinstalled], '4x6', saved);
    expect(result.queue?.deviceName).toBe('iDPRT SP410BT');
    expect(result.savedProblem).toBeNull();
  });
});
