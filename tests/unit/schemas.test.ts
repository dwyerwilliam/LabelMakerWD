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
  printSnapshotSchema,
  rememberedCropSchema,
  shippingLabelPreferencesSchema,
} from '@shared/schemas';
import { createDefaultPreferences, MAX_LAYOUT_LINES } from '@shared/defaults';
import { MAX_SHIPPING_PNG_BASE64_LENGTH } from '@shared/shipping';
import { pngHeader } from './support/png';

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

describe('Shipping label schemas', () => {
  const imageSnapshot = () => ({
    requestId: randomUUID(),
    draftRevision: 4,
    contentKind: 'image' as const,
    text: '',
    profile: '4x6' as const,
    orientation: 'portrait' as const,
    resolvedFontFamily: 'Arial',
    fontSizePt: 24,
    alignment: 'center' as const,
    copies: 1,
    expectedLayout: { logicalWidthPt: 288, logicalHeightPt: 432, lineRectsPt: [], lineTextOffsets: [], overflow: false },
    image: { pngBase64: Buffer.from(pngHeader(812, 1218)).toString('base64'), widthPx: 812, heightPx: 1218 },
  });

  it('accepts the default shipping-label preferences', () => {
    expect(shippingLabelPreferencesSchema.safeParse(createDefaultPreferences().shippingLabel).success).toBe(true);
  });

  it('rejects out-of-range darkness, rotations and crop fractions, and too many crops', () => {
    const base = createDefaultPreferences().shippingLabel;
    const crop = { pageWidthPt: 612, pageHeightPt: 792, rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, rotation: 0 };
    expect(shippingLabelPreferencesSchema.safeParse({ ...base, darkness: 0 }).success).toBe(false);
    expect(shippingLabelPreferencesSchema.safeParse({ ...base, darkness: 6 }).success).toBe(false);
    expect(shippingLabelPreferencesSchema.safeParse({ ...base, mode4x6: 'pdf' }).success).toBe(false);
    expect(rememberedCropSchema.safeParse(crop).success).toBe(true);
    expect(rememberedCropSchema.safeParse({ ...crop, rotation: 45 }).success).toBe(false);
    expect(rememberedCropSchema.safeParse({ ...crop, rect: { ...crop.rect, width: 1.2 } }).success).toBe(false);
    expect(rememberedCropSchema.safeParse({ ...crop, rect: { ...crop.rect, height: 0 } }).success).toBe(false);
    expect(shippingLabelPreferencesSchema.safeParse({ ...base, rememberedCrops: Array(8).fill(crop) }).success).toBe(true);
    expect(shippingLabelPreferencesSchema.safeParse({ ...base, rememberedCrops: Array(9).fill(crop) }).success).toBe(false);
  });

  it('reads preferences written before shipping labels existed, and accepts shipping-label updates', () => {
    const { shippingLabel: _omit, ...older } = createDefaultPreferences();
    expect(preferencesV2Schema.safeParse(older).success).toBe(true);
    expect(preferencesUpdateSchema.safeParse({ shippingLabel: createDefaultPreferences().shippingLabel }).success).toBe(true);
    expect(preferencesUpdateSchema.safeParse({ shippingLabel: { mode4x6: 'image' } }).success).toBe(false);
  });

  it('accepts a valid image print job', () => {
    expect(printSnapshotSchema.safeParse(imageSnapshot()).success).toBe(true);
  });

  it('treats a snapshot without contentKind as a text job', () => {
    const { contentKind: _omit, image: _img, ...legacy } = { ...imageSnapshot(), text: 'Hello' };
    const parsed = printSnapshotSchema.parse(legacy);
    expect(parsed.contentKind).toBe('text');
  });

  it.each([
    ['on the 2 × 1 profile', { profile: '2x1' }, 'profile'],
    ['in landscape', { orientation: 'landscape' }, 'orientation'],
    ['with text', { text: 'Hello' }, 'text'],
    ['without an image', { image: undefined }, 'image'],
    ['with the wrong image width', { image: { pngBase64: 'iVBORw0KGgoAAAANSUhEUg==', widthPx: 800, heightPx: 1218 } }, 'image'],
    ['with non-base64 image data', { image: { pngBase64: 'not base64 at all!!', widthPx: 812, heightPx: 1218 } }, 'image'],
  ])('rejects an image job %s', (_name, change, path) => {
    const result = printSnapshotSchema.safeParse({ ...imageSnapshot(), ...change });
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((issue) => issue.path[0] === path)).toBe(true);
  });

  it('rejects a text job that carries an image', () => {
    const result = printSnapshotSchema.safeParse({ ...imageSnapshot(), contentKind: 'text', text: 'Hello' });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized image payload', () => {
    const huge = 'A'.repeat(MAX_SHIPPING_PNG_BASE64_LENGTH + 4);
    const result = printSnapshotSchema.safeParse({ ...imageSnapshot(), image: { pngBase64: huge, widthPx: 812, heightPx: 1218 } });
    expect(result.success).toBe(false);
  });
});
