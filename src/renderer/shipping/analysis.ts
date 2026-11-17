// Pure image analysis for shipping labels: no DOM, no canvas. Everything works on a
// grayscale grid so it can be unit-tested in Node. See SHIPPING_LABEL_TECHNICAL_SPEC.md §6.
import type { FracRect } from '@shared/shipping';

/** 0 = black, 255 = white. `data` has width × height entries, row by row. */
export interface GrayImage { data: Uint8Array; width: number; height: number }
export interface PxRect { x: number; y: number; width: number; height: number }

/** Resolution PDF pages are rendered at for label detection. */
export const ANALYSIS_DPI = 50;

const INK_LEVEL = 200;                 // value < 200 counts as ink
const MIN_GAP_IN = 0.15;               // whitespace needed to split regions
const RULE_MAX_THICKNESS_IN = 0.06;    // thin full-width lines (fold/cut lines) are erased
const RULE_MIN_SPAN = 0.8;             // ... if their ink spans ≥ 80% of the page dimension
const RULE_MIN_COVERAGE = 0.3;         // ... and covers ≥ 30% of it (dashed lines qualify)
const RULE_MIN_LENGTH_IN = 7.0;        // ... and is longer than any label could be (= L_MAX)
const RULE_MAX_INNER_GAP_IN = 0.25;    // ... and has no gap longer than this (dashes, not unrelated content)
const MAX_DEPTH = 6;
const PAD_IN = 0.06;
// A label whose ink fits within 4 × 6 (plus this much, for a border stroke) is cropped at
// exactly 4 × 6 or a hair more, so it prints at true size rather than shrunk by the padding.
const ACTUAL_SIZE_SLACK_IN = 0.1;
const CONTENT_PAD_IN = 0.1;
// Candidate limits, in inches, on the trimmed ink box (short side s, long side l):
const S_MIN = 2.5, S_MAX = 4.6, L_MIN = 3.75, L_MAX = 7.0, RATIO_MIN = 1.2, RATIO_MAX = 1.9;

// Border peeling (snips): a line is peelable when it is one flat, not-near-black color.
const PEEL_MIN_MEDIAN = 40;
const PEEL_TOLERANCE = 16;
const PEEL_UNIFORM_SHARE = 0.98;
const PEEL_MIN_RESULT_SHARE = 0.2;

/** Luminance of one RGBA pixel composited over white, rounded to 0–255. */
function luminance(rgba: Uint8ClampedArray | Uint8Array, i: number): number {
  const a = rgba[i + 3] / 255;
  const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return Math.round(lum * a + 255 * (1 - a));
}

export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < data.length; p++, i += 4) data[p] = luminance(rgba, i);
  return { data, width, height };
}

/** Turns every pixel black (lum < threshold) or white, opaque. Returns how many are black. */
export function thresholdRgbaInPlace(rgba: Uint8ClampedArray | Uint8Array, threshold: number): { blackPixels: number } {
  let blackPixels = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const v = luminance(rgba, i) < threshold ? 0 : 255;
    if (v === 0) blackPixels++;
    rgba[i] = v;
    rgba[i + 1] = v;
    rgba[i + 2] = v;
    rgba[i + 3] = 255;
  }
  return { blackPixels };
}

/** Smallest rect inside `region` holding every pixel for which `isInk(index)` is true, or null. */
function boundsWhere(width: number, region: PxRect, isInk: (index: number) => boolean): PxRect | null {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = region.y; y < region.y + region.height; y++) {
    const row = y * width;
    for (let x = region.x; x < region.x + region.width; x++) {
      if (!isInk(row + x)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function inkBounds(img: GrayImage, region: PxRect, inkLevel = INK_LEVEL): PxRect | null {
  return boundsWhere(img.width, region, (i) => img.data[i] < inkLevel);
}

function fullRect(img: { width: number; height: number }): PxRect {
  return { x: 0, y: 0, width: img.width, height: img.height };
}

function padRect(r: PxRect, pad: number, width: number, height: number): PxRect {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  const right = Math.min(width, r.x + r.width + pad);
  const bottom = Math.min(height, r.y + r.height + pad);
  return { x, y, width: right - x, height: bottom - y };
}

// ---------------------------------------------------------------------------
// Border peeling (snips and image files)
// ---------------------------------------------------------------------------

/**
 * True when the line of `length` pixels starting at `start` (stepping by `step`) is one flat,
 * not-near-black color: median ≥ 40 and at least 98% of pixels within ±16 of it.
 */
function isPeelable(data: Uint8Array, start: number, step: number, length: number): boolean {
  const histogram = new Uint32Array(256);
  for (let k = 0, i = start; k < length; k++, i += step) histogram[data[i]]++;

  let median = 0;
  for (let seen = 0, half = Math.ceil(length / 2); median < 256; median++) {
    seen += histogram[median];
    if (seen >= half) break;
  }
  if (median < PEEL_MIN_MEDIAN) return false;

  let near = 0;
  for (let v = Math.max(0, median - PEEL_TOLERANCE); v <= Math.min(255, median + PEEL_TOLERANCE); v++) near += histogram[v];
  return near >= PEEL_UNIFORM_SHARE * length;
}

/**
 * Removes outer bands of uniform color (white margins, the gray background of a PDF viewer)
 * and stops at content or at a near-black line, so a label's black border is kept.
 */
export function peelUniformBorders(img: GrayImage): PxRect {
  const { data, width } = img;
  const r = fullRect(img);

  const topRow = () => isPeelable(data, r.y * width + r.x, 1, r.width);
  const bottomRow = () => isPeelable(data, (r.y + r.height - 1) * width + r.x, 1, r.width);
  const leftCol = () => isPeelable(data, r.y * width + r.x, width, r.height);
  const rightCol = () => isPeelable(data, r.y * width + r.x + r.width - 1, width, r.height);

  let changed = true;
  while (changed) {
    changed = false;
    while (r.height > 1 && topRow()) { r.y++; r.height--; changed = true; }
    while (r.height > 1 && bottomRow()) { r.height--; changed = true; }
    while (r.width > 1 && leftCol()) { r.x++; r.width--; changed = true; }
    while (r.width > 1 && rightCol()) { r.width--; changed = true; }
  }

  if (r.width < PEEL_MIN_RESULT_SHARE * img.width || r.height < PEEL_MIN_RESULT_SHARE * img.height) {
    return fullRect(img);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Label detection (PDF pages)
// ---------------------------------------------------------------------------

/** Clears thin lines that run across (nearly) the whole page: fold and cut lines. */
function eraseRules(mask: Uint8Array, width: number, height: number, dpi: number): void {
  const maxThickness = Math.ceil(RULE_MAX_THICKNESS_IN * dpi);
  const minLength = RULE_MIN_LENGTH_IN * dpi;
  const maxInnerGap = RULE_MAX_INNER_GAP_IN * dpi;

  // `lines` lines of `span` pixels each; pixel k of line n is at index(n, k).
  const eraseAlong = (lines: number, span: number, index: (n: number, k: number) => number) => {
    const isRule = new Array<boolean>(lines);
    for (let n = 0; n < lines; n++) {
      let first = -1, last = -1, count = 0, widestGap = 0;
      for (let k = 0; k < span; k++) {
        if (!mask[index(n, k)]) continue;
        if (first < 0) first = k;
        else if (k - last - 1 > widestGap) widestGap = k - last - 1;
        last = k;
        count++;
      }
      const extent = last - first + 1;
      isRule[n] =
        first >= 0 &&
        extent >= RULE_MIN_SPAN * span &&
        extent > minLength &&
        count >= RULE_MIN_COVERAGE * span &&
        widestGap <= maxInnerGap;
    }
    for (let n = 0; n < lines; ) {
      if (!isRule[n]) { n++; continue; }
      let end = n;
      while (end < lines && isRule[end]) end++;
      if (end - n <= maxThickness) {
        for (let m = n; m < end; m++) for (let k = 0; k < span; k++) mask[index(m, k)] = 0;
      }
      n = end;
    }
  };

  eraseAlong(height, width, (y, x) => y * width + x);
  eraseAlong(width, height, (x, y) => y * width + x);
}

/** Longest run of lines with no ink strictly inside `r` (rows when `rows`, else columns). */
function longestGap(mask: Uint8Array, width: number, r: PxRect, rows: boolean): { start: number; length: number } {
  const lines = rows ? r.height : r.width;
  const span = rows ? r.width : r.height;
  let best = { start: 0, length: 0 };
  let runStart = -1;
  for (let n = 0; n < lines; n++) {
    let empty = true;
    for (let k = 0; k < span && empty; k++) {
      const x = rows ? r.x + k : r.x + n;
      const y = rows ? r.y + n : r.y + k;
      if (mask[y * width + x]) empty = false;
    }
    if (empty) {
      if (runStart < 0) runStart = n;
      const length = n - runStart + 1;
      if (length > best.length) best = { start: runStart, length };
    } else {
      runStart = -1;
    }
  }
  return best;
}

/** XY-cut: every trimmed region along the way is a candidate, not just the leaves. */
function collectRegions(mask: Uint8Array, width: number, region: PxRect, depth: number, minGap: number, out: PxRect[]): void {
  const r = boundsWhere(width, region, (i) => mask[i] === 1);
  if (!r) return;
  out.push(r);
  if (depth >= MAX_DEPTH) return;

  const rowGap = longestGap(mask, width, r, true);
  const colGap = longestGap(mask, width, r, false);
  if (Math.max(rowGap.length, colGap.length) < minGap) return;

  if (rowGap.length >= colGap.length) {
    const cut = r.y + rowGap.start;
    collectRegions(mask, width, { x: r.x, y: r.y, width: r.width, height: cut - r.y }, depth + 1, minGap, out);
    const after = cut + rowGap.length;
    collectRegions(mask, width, { x: r.x, y: after, width: r.width, height: r.y + r.height - after }, depth + 1, minGap, out);
  } else {
    const cut = r.x + colGap.start;
    collectRegions(mask, width, { x: r.x, y: r.y, width: cut - r.x, height: r.height }, depth + 1, minGap, out);
    const after = cut + colGap.length;
    collectRegions(mask, width, { x: after, y: r.y, width: r.x + r.width - after, height: r.height }, depth + 1, minGap, out);
  }
}

/**
 * Finds the region of a rendered PDF page that looks most like a 4 × 6 label.
 * Returns it (padded) in `img` pixels, or null when nothing is label-sized.
 */
export function detectLabelRegion(img: GrayImage, dpi: number): PxRect | null {
  const { width, height } = img;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = img.data[i] < INK_LEVEL ? 1 : 0;

  eraseRules(mask, width, height, dpi);

  const candidates: PxRect[] = [];
  collectRegions(mask, width, fullRect(img), 0, Math.round(MIN_GAP_IN * dpi), candidates);

  let best: { rect: PxRect; err: number; area: number } | null = null;
  for (const c of candidates) {
    const w = c.width / dpi;
    const h = c.height / dpi;
    const s = Math.min(w, h);
    const l = Math.max(w, h);
    if (s < S_MIN || s > S_MAX || l < L_MIN || l > L_MAX) continue;
    const ratio = l / s;
    if (ratio < RATIO_MIN || ratio > RATIO_MAX) continue;

    const err = Math.abs(s - 4) / 4 + Math.abs(l - 6) / 6;
    const area = c.width * c.height;
    if (!best || err < best.err - 0.02 || (Math.abs(err - best.err) <= 0.02 && area > best.area)) {
      best = { rect: c, err, area };
    }
  }

  if (!best) return null;
  return labelCrop(best.rect, dpi, width, height);
}

/**
 * The crop for a detected label. A label that fits within 4 × 6 gets a 4 × 6 (or 6 × 4) window
 * centered on it, never smaller than its ink plus one pixel each side, so it prints at true size.
 * A bigger one gets the usual padding and is scaled down to fit.
 */
function labelCrop(ink: PxRect, dpi: number, width: number, height: number): PxRect {
  const portrait = ink.height >= ink.width;
  const targetW = (portrait ? 4 : 6) * dpi;
  const targetH = (portrait ? 6 : 4) * dpi;
  const slack = ACTUAL_SIZE_SLACK_IN * dpi;
  if (ink.width > targetW + slack || ink.height > targetH + slack) {
    return padRect(ink, Math.round(PAD_IN * dpi), width, height);
  }

  const w = Math.min(width, Math.max(Math.round(targetW), ink.width + 2));
  const h = Math.min(height, Math.max(Math.round(targetH), ink.height + 2));
  const cx = ink.x + ink.width / 2;
  const cy = ink.y + ink.height / 2;
  // Centered on the ink, shifted (not shrunk) to stay on the page.
  const x = Math.min(width - w, Math.max(0, Math.round(cx - w / 2)));
  const y = Math.min(height - h, Math.max(0, Math.round(cy - h / 2)));
  return { x, y, width: w, height: h };
}

/** Fallback suggestion when detection finds nothing: all the page's content, padded. */
export function contentArea(img: GrayImage, dpi: number): PxRect {
  const r = inkBounds(img, fullRect(img));
  if (!r) return fullRect(img);
  return padRect(r, Math.round(CONTENT_PAD_IN * dpi), img.width, img.height);
}

export function pxRectToFrac(r: PxRect, w: number, h: number): FracRect {
  return { x: r.x / w, y: r.y / h, width: r.width / w, height: r.height / h };
}

export function fracRectToPx(r: FracRect, w: number, h: number): PxRect {
  return {
    x: Math.round(r.x * w),
    y: Math.round(r.y * h),
    width: Math.round(r.width * w),
    height: Math.round(r.height * h),
  };
}
