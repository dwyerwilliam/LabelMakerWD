import { z } from 'zod';
import {
  MIN_FONT_SIZE_PT,
  MAX_FONT_SIZE_PT,
  MIN_COPIES,
  MAX_COPIES,
} from './defaults';

export const orientationSchema = z.enum(['portrait', 'landscape']);
export const alignmentSchema = z.enum(['left', 'center', 'right']);
export const printerProfileSchema = z.enum(['4x6', '2x1']);

export const fontSizePtSchema = z.number()
  .min(MIN_FONT_SIZE_PT)
  .max(MAX_FONT_SIZE_PT)
  .refine(
    (val) => Math.round(val * 2) === val * 2,
    { message: 'Font size must be in 0.5 pt increments' }
  );

export const copiesSchema = z.number()
  .int()
  .min(MIN_COPIES)
  .max(MAX_COPIES);

// Max 1 MiB UTF-8 text limit
export const labelTextSchema = z.string().max(1024 * 1024);

export const printerChoiceSchema = z.object({
  deviceName: z.string().min(1),
  platform: z.enum(['win32', 'darwin']),
  identityFingerprint: z.string(),
  manualProfileConfirmed: z.boolean(),
  usbConfirmed: z.boolean(),
});

export const legacyPrinterChoiceSchema = z.object({
  deviceName: z.string().min(1),
  platform: z.enum(['win32', 'darwin']),
  identityFingerprint: z.string(),
  manualSp410Confirmed: z.boolean(),
  usbConfirmed: z.boolean(),
});

export const legacyPreferencesV1Schema = z.object({
  schemaVersion: z.literal(1),
  orientation: orientationSchema,
  fontFamily: z.string().min(1),
  fontSizePt: fontSizePtSchema,
  alignment: alignmentSchema,
  printer: legacyPrinterChoiceSchema.nullable(),
});

export const profilePreferencesSchema = z.object({
  orientation: orientationSchema,
  fontFamily: z.string().min(1),
  fontSizePt: fontSizePtSchema,
  alignment: alignmentSchema,
  printer: printerChoiceSchema.nullable(),
});

export const profilesSchema = z.object({
  '4x6': profilePreferencesSchema,
  '2x1': profilePreferencesSchema,
});

export const preferencesV2Schema = z.object({
  schemaVersion: z.literal(2),
  activeProfile: printerProfileSchema,
  profiles: profilesSchema,
});

export const preferencesUpdateSchema = z.object({
  activeProfile: printerProfileSchema.optional(),
  profiles: profilesSchema.optional(),
}).strict();

export const layoutFingerprintSchema = z.object({
  logicalWidthPt: z.number(),
  logicalHeightPt: z.number(),
  lineRectsPt: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
  ),
  lineTextOffsets: z.array(z.number()),
  overflow: z.boolean(),
});

export const printSnapshotSchema = z.object({
  requestId: z.string().uuid(),
  draftRevision: z.number().int().nonnegative(),
  text: labelTextSchema,
  profile: printerProfileSchema,
  orientation: orientationSchema,
  resolvedFontFamily: z.string().min(1),
  fontSizePt: fontSizePtSchema,
  alignment: alignmentSchema,
  copies: copiesSchema,
  expectedLayout: layoutFingerprintSchema,
});

export const preparePrintPayloadSchema = z.object({
  snapshot: printSnapshotSchema,
});

export const confirmPrintPayloadSchema = z.object({
  token: z.string().min(1),
  requestId: z.string().uuid(),
});
