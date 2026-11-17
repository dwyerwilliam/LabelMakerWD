import type { LayoutFingerprint } from './contracts';

/** SP410 resolution. A 4 × 6 in label is 812 × 1218 printer dots. */
export const SHIPPING_DPI = 203;
export const SHIPPING_WIDTH_IN = 4;
export const SHIPPING_HEIGHT_IN = 6;
// Written as literals (not 4 * 203) so their types are the literal values the IPC schema
// and ShippingImagePayload require. A unit test checks they equal inches × dpi.
export const SHIPPING_WIDTH_PX = 812 as const;   // SHIPPING_WIDTH_IN × SHIPPING_DPI
export const SHIPPING_HEIGHT_PX = 1218 as const; // SHIPPING_HEIGHT_IN × SHIPPING_DPI

/** Largest file the user may open or paste. */
export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;
/** Largest final PNG accepted over IPC (a real 1-bit label is usually 30–300 KB). */
export const MAX_SHIPPING_PNG_BYTES = 4 * 1024 * 1024;
export const MAX_SHIPPING_PNG_BASE64_LENGTH = Math.ceil(MAX_SHIPPING_PNG_BYTES / 3) * 4;

/** Darkness steps 1–5 → luminance threshold. A pixel darker than the threshold prints black. */
export const DARKNESS_THRESHOLDS = { 1: 112, 2: 136, 3: 160, 4: 184, 5: 208 } as const;
export type Darkness = keyof typeof DARKNESS_THRESHOLDS; // 1 | 2 | 3 | 4 | 5
export const DEFAULT_DARKNESS: Darkness = 3;

/** Output rotation, clockwise, applied after cropping. */
export type Rotation = 0 | 90 | 180 | 270;

/** A rectangle as fractions (0–1) of the source page or image, in its displayed orientation. */
export interface FracRect { x: number; y: number; width: number; height: number }

/** How many remembered PDF crops are kept, and how close page sizes must be to match. */
export const MAX_REMEMBERED_CROPS = 8;
export const REMEMBERED_CROP_TOLERANCE_PT = 2;

/** Image sources below this effective resolution get the low-resolution warning. */
export const LOW_DPI_WARNING = 150;
/** Aspect ratio (height/width) more than this fraction away from 1.5 gets the aspect warning. */
export const ASPECT_WARNING_TOLERANCE = 0.12;
/** A PDF crop that is already 4 × 6 within this many inches skips the dialog. */
export const FOUR_BY_SIX_PAGE_TOLERANCE_IN = 0.15;

/**
 * The layout fingerprint every shipping-label job reports. The image always fills one
 * portrait 4 × 6 page and has no text lines, so the preview and the print window agree by construction.
 */
export const IMAGE_LAYOUT_FINGERPRINT: LayoutFingerprint = {
  logicalWidthPt: 288,
  logicalHeightPt: 432,
  lineRectsPt: [],
  lineTextOffsets: [],
  overflow: false,
};

/** Reads width and height from a PNG's IHDR chunk. Returns null if the bytes are not a PNG. */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24) return null;
  for (let i = 0; i < 8; i++) if (bytes[i] !== signature[i]) return null;
  // Chunk type at bytes 12–15 must be "IHDR".
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Clamps a fractional rect so it lies inside [0,1]² and is at least minW × minH (fractions). */
export function clampFracRect(r: FracRect, minW: number, minH: number): FracRect {
  const width = Math.min(1, Math.max(minW, r.width));
  const height = Math.min(1, Math.max(minH, r.height));
  const x = Math.min(1 - width, Math.max(0, r.x));
  const y = Math.min(1 - height, Math.max(0, r.y));
  return { x, y, width, height };
}

export interface FitResult { width: number; height: number; offsetX: number; offsetY: number; scale: number }

/**
 * Uniform fit of a (srcW × srcH) box into the 812 × 1218 label, centered.
 * `scale` is output pixels per source unit. All results are integers except `scale`.
 */
export function fitToLabel(srcW: number, srcH: number): FitResult {
  const scale = Math.min(SHIPPING_WIDTH_PX / srcW, SHIPPING_HEIGHT_PX / srcH);
  const width = Math.max(1, Math.min(SHIPPING_WIDTH_PX, Math.round(srcW * scale)));
  const height = Math.max(1, Math.min(SHIPPING_HEIGHT_PX, Math.round(srcH * scale)));
  return {
    width,
    height,
    offsetX: Math.floor((SHIPPING_WIDTH_PX - width) / 2),
    offsetY: Math.floor((SHIPPING_HEIGHT_PX - height) / 2),
    scale,
  };
}

/** Width/height after rotating a w × h box. */
export function rotatedSize(w: number, h: number, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h };
}

export function addRotation(r: Rotation, delta: 90 | -90): Rotation {
  return ((((r + delta) % 360) + 360) % 360) as Rotation;
}

/** True when height/width is more than ASPECT_WARNING_TOLERANCE away from 6/4. */
export function isOffAspect(w: number, h: number): boolean {
  return Math.abs(h / w - 1.5) / 1.5 > ASPECT_WARNING_TOLERANCE;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
