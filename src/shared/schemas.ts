import { z } from 'zod';
import {
  MIN_FONT_SIZE_PT,
  MAX_FONT_SIZE_PT,
  MIN_COPIES,
  MAX_COPIES,
  MAX_LAYOUT_LINES,
} from './defaults';
import {
  MAX_REMEMBERED_CROPS,
  MAX_SHIPPING_PNG_BASE64_LENGTH,
  SHIPPING_HEIGHT_PX,
  SHIPPING_WIDTH_PX,
} from './shipping';

export const orientationSchema = z.enum(['portrait', 'landscape']);
export const alignmentSchema = z.enum(['left', 'center', 'right']);
export const printerProfileSchema = z.enum(['4x6', '2x1']);

export const fontSizePtSchema = z.number()
  .min(MIN_FONT_SIZE_PT)
  .max(MAX_FONT_SIZE_PT)
  .refine(
    (val) => Math.round(val * 2) === val * 2,
    { error: 'Font size must be in 0.5 pt increments' }
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

export const contentModeSchema = z.enum(['text', 'image']);
export const rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const fraction = z.number().min(0).max(1);

export const rememberedCropSchema = z.object({
  pageWidthPt: z.number().positive().max(14400),
  pageHeightPt: z.number().positive().max(14400),
  rect: z.object({ x: fraction, y: fraction, width: fraction.positive(), height: fraction.positive() }),
  rotation: rotationSchema,
});

export const shippingLabelPreferencesSchema = z.object({
  mode4x6: contentModeSchema,
  darkness: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  rememberedCrops: z.array(rememberedCropSchema).max(MAX_REMEMBERED_CROPS),
});

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export const shippingImagePayloadSchema = z.object({
  pngBase64: z.string().min(16).max(MAX_SHIPPING_PNG_BASE64_LENGTH).regex(BASE64_RE),
  widthPx: z.literal(SHIPPING_WIDTH_PX),
  heightPx: z.literal(SHIPPING_HEIGHT_PX),
});

// `shippingLabel` is optional when reading: settings files written before shipping
// labels existed do not have it. SettingsService fills in the default.
export const preferencesV2Schema = z.object({
  schemaVersion: z.literal(2),
  activeProfile: printerProfileSchema,
  profiles: profilesSchema,
  shippingLabel: shippingLabelPreferencesSchema.optional(),
});

export const preferencesUpdateSchema = z.strictObject({
  activeProfile: printerProfileSchema.optional(),
  profiles: profilesSchema.optional(),
  shippingLabel: shippingLabelPreferencesSchema.optional(),
});

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
  ).max(MAX_LAYOUT_LINES),
  lineTextOffsets: z.array(z.number()).max(MAX_LAYOUT_LINES),
  overflow: z.boolean(),
});

export const printSnapshotSchema = z.object({
  requestId: z.uuid(),
  draftRevision: z.number().int().nonnegative(),
  contentKind: contentModeSchema.default('text'),
  text: labelTextSchema,
  profile: printerProfileSchema,
  orientation: orientationSchema,
  resolvedFontFamily: z.string().min(1),
  fontSizePt: fontSizePtSchema,
  alignment: alignmentSchema,
  copies: copiesSchema,
  expectedLayout: layoutFingerprintSchema,
  image: shippingImagePayloadSchema.optional(),
}).superRefine((s, ctx) => {
  if (s.contentKind === 'image') {
    if (!s.image) ctx.addIssue({ code: 'custom', path: ['image'], message: 'An image job needs an image.' });
    if (s.profile !== '4x6') ctx.addIssue({ code: 'custom', path: ['profile'], message: 'Shipping labels print on the 4 × 6 profile only.' });
    if (s.orientation !== 'portrait') ctx.addIssue({ code: 'custom', path: ['orientation'], message: 'Shipping labels print portrait.' });
    if (s.text !== '') ctx.addIssue({ code: 'custom', path: ['text'], message: 'An image job has no text.' });
  } else if (s.image) {
    ctx.addIssue({ code: 'custom', path: ['image'], message: 'A text job must not carry an image.' });
  }
});

export const preparePrintPayloadSchema = z.object({
  snapshot: printSnapshotSchema,
});

export const labelHasTextSchema = z.boolean();

export const selectPrinterPayloadSchema = z.object({
  profile: printerProfileSchema,
  deviceName: z.string().min(1).max(512),
  manualConfirm: z.boolean().optional(),
});

export const cancelPrintPayloadSchema = z.object({
  token: z.string().min(1).max(256),
});

export const printStatusPayloadSchema = z.object({
  requestId: z.uuid(),
});

/** What the hidden print window reports once it has laid out a label. */
export const printWindowReadyPayloadSchema = z.object({
  requestId: z.uuid(),
  fingerprint: layoutFingerprintSchema,
});

export const confirmPrintPayloadSchema = z.object({
  token: z.string().min(1),
  requestId: z.uuid(),
});
