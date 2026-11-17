import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import {
  fontSizePtSchema,
  copiesSchema,
  labelTextSchema,
  preferencesV2Schema,
  preferencesUpdateSchema,
  layoutFingerprintSchema,
  preparePrintPayloadSchema,
  confirmPrintPayloadSchema,
} from '@shared/schemas';
import { MAX_LAYOUT_LINES } from '@shared/defaults';

describe('Zod Contracts & Validation Schemas', () => {
  it('validates point sizes strictly', () => {
    expect(fontSizePtSchema.safeParse(6).success).toBe(true);
    expect(fontSizePtSchema.safeParse(24).success).toBe(true);
    expect(fontSizePtSchema.safeParse(72.5).success).toBe(true);
    expect(fontSizePtSchema.safeParse(288).success).toBe(true);

    // Below min
    expect(fontSizePtSchema.safeParse(5.5).success).toBe(false);
    // Above max
    expect(fontSizePtSchema.safeParse(288.5).success).toBe(false);
    // Not 0.5 increment
    expect(fontSizePtSchema.safeParse(24.3).success).toBe(false);
  });

  it('validates copies between 1 and 99 integers', () => {
    expect(copiesSchema.safeParse(1).success).toBe(true);
    expect(copiesSchema.safeParse(50).success).toBe(true);
    expect(copiesSchema.safeParse(99).success).toBe(true);

    expect(copiesSchema.safeParse(0).success).toBe(false);
    expect(copiesSchema.safeParse(100).success).toBe(false);
    expect(copiesSchema.safeParse(1.5).success).toBe(false);
  });

  it('enforces 1 MiB UTF-8 text limit', () => {
    const valid = 'A'.repeat(1000);
    expect(labelTextSchema.safeParse(valid).success).toBe(true);

    const tooLarge = 'A'.repeat(1024 * 1024 + 1);
    expect(labelTextSchema.safeParse(tooLarge).success).toBe(false);
  });

  it('validates complete preferences object', () => {
    const valid = {
      schemaVersion: 2,
      activeProfile: '4x6',
      profiles: {
        '4x6': {
          orientation: 'portrait',
          fontFamily: 'Arial',
          fontSizePt: 24,
          alignment: 'center',
          printer: {
            deviceName: 'iDPRT SP410BT',
            platform: 'win32',
            identityFingerprint: 'model:driver:port',
            manualProfileConfirmed: false,
            usbConfirmed: true,
          },
        },
        '2x1': {
          orientation: 'landscape',
          fontFamily: 'Arial',
          fontSizePt: 12,
          alignment: 'center',
          printer: null,
        },
      },
    };
    expect(preferencesV2Schema.safeParse(valid).success).toBe(true);
  });
});

describe('IPC payload schemas', () => {
  const line = { x: 0, y: 0, width: 10, height: 10 };
  const fingerprint = {
    logicalWidthPt: 288,
    logicalHeightPt: 432,
    lineRectsPt: [line],
    lineTextOffsets: [0],
    overflow: false,
  };
  const snapshot = {
    requestId: randomUUID(),
    draftRevision: 3,
    text: 'Hello',
    profile: '4x6',
    orientation: 'portrait',
    resolvedFontFamily: 'Arial',
    fontSizePt: 24,
    alignment: 'center',
    copies: 1,
    expectedLayout: fingerprint,
  };

  it('accepts a complete print snapshot with a crypto.randomUUID() request id', () => {
    expect(preparePrintPayloadSchema.safeParse({ snapshot }).success).toBe(true);
  });

  it('rejects snapshots with a bad request id, font size or copy count', () => {
    expect(preparePrintPayloadSchema.safeParse({ snapshot: { ...snapshot, requestId: 'not-a-uuid' } }).success).toBe(false);
    expect(preparePrintPayloadSchema.safeParse({ snapshot: { ...snapshot, fontSizePt: 24.3 } }).success).toBe(false);
    expect(preparePrintPayloadSchema.safeParse({ snapshot: { ...snapshot, copies: 0 } }).success).toBe(false);
    expect(preparePrintPayloadSchema.safeParse({ snapshot: { ...snapshot, profile: '3x5' } }).success).toBe(false);
  });

  it('requires a uuid request id and a token to confirm a print', () => {
    expect(confirmPrintPayloadSchema.safeParse({ token: 'abc', requestId: randomUUID() }).success).toBe(true);
    expect(confirmPrintPayloadSchema.safeParse({ token: '', requestId: randomUUID() }).success).toBe(false);
    expect(confirmPrintPayloadSchema.safeParse({ token: 'abc', requestId: '123' }).success).toBe(false);
  });

  it('rejects non-finite layout numbers', () => {
    expect(layoutFingerprintSchema.safeParse({ ...fingerprint, logicalWidthPt: Infinity }).success).toBe(false);
    expect(layoutFingerprintSchema.safeParse({ ...fingerprint, logicalHeightPt: NaN }).success).toBe(false);
  });

  it('caps the number of measured lines in a layout fingerprint', () => {
    const atCap = new Array(MAX_LAYOUT_LINES).fill(0);
    const overCap = new Array(MAX_LAYOUT_LINES + 1).fill(0);

    expect(layoutFingerprintSchema.safeParse({ ...fingerprint, lineTextOffsets: atCap }).success).toBe(true);
    expect(layoutFingerprintSchema.safeParse({ ...fingerprint, lineTextOffsets: overCap }).success).toBe(false);
    expect(
      layoutFingerprintSchema.safeParse({ ...fingerprint, lineRectsPt: new Array(MAX_LAYOUT_LINES + 1).fill(line) }).success
    ).toBe(false);
  });

  it('accepts partial preference updates but rejects unknown keys', () => {
    expect(preferencesUpdateSchema.safeParse({ activeProfile: '2x1' }).success).toBe(true);
    expect(preferencesUpdateSchema.safeParse({}).success).toBe(true);
    expect(preferencesUpdateSchema.safeParse({ activeProfile: '2x1', extra: true }).success).toBe(false);
    expect(preferencesUpdateSchema.safeParse({ activeProfile: '9x9' }).success).toBe(false);
  });
});
