// Turns a source (PDF page or image) plus a crop into the 812 × 1218 black-and-white label
// image that is previewed and printed. See SHIPPING_LABEL_TECHNICAL_SPEC.md §8.
import {
  bytesToBase64,
  DARKNESS_THRESHOLDS,
  fitToLabel,
  isOffAspect,
  LOW_DPI_WARNING,
  MAX_SHIPPING_PNG_BYTES,
  rotatedSize,
  SHIPPING_DPI,
  SHIPPING_HEIGHT_PX,
  SHIPPING_WIDTH_PX,
  type Darkness,
  type Rotation,
} from '@shared/shipping';
import { thresholdRgbaInPlace } from './analysis';
import type { CropChoice, LoadedSource } from './sources/types';

export interface ProcessedShippingImage {
  pngBase64: string;
  objectUrl: string;            // URL.createObjectURL(pngBlob), for the on-screen preview
  caption: string;              // FS §4.2 caption text
  scalePercent: number | null;  // PDF only
  effectiveDpi: number | null;  // image only
  lowResolution: boolean;
  offAspect: boolean;
  offScale: boolean;            // PDF scale outside 90–110%
  blank: boolean;
}

interface ComposeMetrics {
  scalePercent: number | null;
  effectiveDpi: number | null;
  offAspect: boolean;
  blank: boolean;
}

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  return ctx;
}

/** Frees a canvas's pixel memory now rather than whenever it is garbage-collected. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Rotates clockwise by whole quarter turns with integer transforms: no resampling. */
export function rotateCanvas(src: HTMLCanvasElement, rotation: Rotation): HTMLCanvasElement {
  if (rotation === 0) return src;
  const out = document.createElement('canvas');
  const swap = rotation === 90 || rotation === 270;
  out.width = swap ? src.height : src.width;
  out.height = swap ? src.width : src.height;
  const ctx = context(out);
  ctx.imageSmoothingEnabled = false;
  if (rotation === 90) ctx.setTransform(0, 1, -1, 0, out.width, 0);          // clockwise
  else if (rotation === 180) ctx.setTransform(-1, 0, 0, -1, out.width, out.height);
  else ctx.setTransform(0, -1, 1, 0, 0, out.height);                          // 270 = counter-clockwise
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Draws the crop, rotated, fitted and thresholded, onto a new 812 × 1218 canvas. */
async function composeLabelCanvas(
  source: LoadedSource,
  choice: CropChoice,
  darkness: Darkness
): Promise<{ canvas: HTMLCanvasElement; metrics: ComposeMetrics }> {
  const { crop, rotation } = choice;

  // 1. Crop size in source units (PDF points, or image pixels).
  let cw: number;
  let ch: number;
  if (source.kind === 'pdf') {
    const page = await source.pdf.pageSizePt(choice.pageIndex);
    cw = crop.width * page.width;
    ch = crop.height * page.height;
  } else {
    cw = crop.width * source.width;
    ch = crop.height * source.height;
  }

  // 2. Fit the rotated crop into the label.
  const { w: rw, h: rh } = rotatedSize(cw, ch, rotation);
  const fit = fitToLabel(rw, rh);
  const quarterTurn = rotation === 90 || rotation === 270;
  const ow = quarterTurn ? fit.height : fit.width;
  const oh = quarterTurn ? fit.width : fit.height;

  // 3. Draw the crop at its final size, unrotated. PDFs are rendered straight at printer resolution.
  let piece: HTMLCanvasElement;
  if (source.kind === 'pdf') {
    piece = await source.pdf.renderRegion(choice.pageIndex, crop, ow, oh);
  } else {
    piece = newCanvas(ow, oh);
    const ctx = context(piece);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ow, oh);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.bitmap, crop.x * source.width, crop.y * source.height, cw, ch, 0, 0, ow, oh);
  }

  // 4. Rotate (exact), 5. compose centered on white with no smoothing.
  const rotated = rotateCanvas(piece, rotation);
  const canvas = newCanvas(SHIPPING_WIDTH_PX, SHIPPING_HEIGHT_PX);
  const ctx = context(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SHIPPING_WIDTH_PX, SHIPPING_HEIGHT_PX);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(rotated, fit.offsetX, fit.offsetY);
  if (rotated !== piece) releaseCanvas(rotated);
  releaseCanvas(piece);

  // 6. Threshold to pure black and white.
  const image = ctx.getImageData(0, 0, SHIPPING_WIDTH_PX, SHIPPING_HEIGHT_PX);
  const { blackPixels } = thresholdRgbaInPlace(image.data, DARKNESS_THRESHOLDS[darkness]);
  ctx.putImageData(image, 0, 0);

  return {
    canvas,
    metrics: {
      // PDF: output px per point ÷ printer px per point.
      scalePercent: source.kind === 'pdf' ? Math.round((fit.scale / (SHIPPING_DPI / 72)) * 100) : null,
      // Image: source pixels per printed inch.
      effectiveDpi: source.kind === 'image' ? Math.round(rw / (fit.width / SHIPPING_DPI)) : null,
      offAspect: isOffAspect(rw, rh),
      blank: blackPixels === 0,
    },
  };
}

/** The black-and-white label canvas only, for the crop dialog's live thumbnail. */
export async function renderPreviewThumbnail(
  source: LoadedSource,
  choice: CropChoice,
  darkness: Darkness
): Promise<HTMLCanvasElement> {
  return (await composeLabelCanvas(source, choice, darkness)).canvas;
}

function captionFor(source: LoadedSource, choice: CropChoice, metrics: ComposeMetrics): string {
  if (source.kind === 'pdf') {
    const pct = metrics.scalePercent ?? 100;
    const size = pct >= 97 && pct <= 103 ? 'actual size' : `prints at ${pct}% of original size`;
    return `From ${source.fileName}, page ${choice.pageIndex + 1} · ${size}`;
  }
  const from = source.origin === 'clipboard' ? 'clipboard snip' : (source.fileName ?? 'image');
  return `From ${from} · about ${metrics.effectiveDpi} dpi`;
}

export async function renderShippingLabel(
  source: LoadedSource,
  choice: CropChoice,
  darkness: Darkness
): Promise<ProcessedShippingImage> {
  const { canvas, metrics } = await composeLabelCanvas(source, choice, darkness);

  // 7. Encode.
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  releaseCanvas(canvas);
  if (!blob) throw new Error('encode');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length > MAX_SHIPPING_PNG_BYTES) throw new Error('too-large');

  // 8. Metrics.
  const scalePercent = metrics.scalePercent;
  return {
    pngBase64: bytesToBase64(bytes),
    objectUrl: URL.createObjectURL(blob),
    caption: captionFor(source, choice, metrics),
    scalePercent,
    effectiveDpi: metrics.effectiveDpi,
    lowResolution: metrics.effectiveDpi !== null && metrics.effectiveDpi < LOW_DPI_WARNING,
    offAspect: metrics.offAspect,
    offScale: scalePercent !== null && (scalePercent < 90 || scalePercent > 110),
    blank: metrics.blank,
  };
}
