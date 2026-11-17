import { describe, it, expect } from 'vitest';
import {
  fontSizePtSchema,
  copiesSchema,
  labelTextSchema,
  preferencesV1Schema,
} from '@shared/schemas';

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
      schemaVersion: 1,
      orientation: 'portrait',
      fontFamily: 'Arial',
      fontSizePt: 24,
      alignment: 'center',
      printer: {
        deviceName: 'iDPRT SP410BT',
        platform: 'win32',
        identityFingerprint: 'model:driver:port',
        manualSp410Confirmed: false,
        usbConfirmed: true,
      },
    };
    expect(preferencesV1Schema.safeParse(valid).success).toBe(true);
  });
});
