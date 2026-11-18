import { describe, it, expect } from 'vitest';
import {
  ANALYSIS_DPI,
  contentArea,
  detectLabelRegion,
  fracRectToPx,
  inkBounds,
  peelUniformBorders,
  pxRectToFrac,
  thresholdRgbaInPlace,
  toGray,
  type GrayImage,
  type PxRect,
} from '@renderer/shipping/analysis';

const DPI = ANALYSIS_DPI;
const px = (inches: number) => Math.round(inches * DPI);

/** A white page of wIn × hIn inches at `dpi`. */
function page(wIn: number, hIn: number, dpi = DPI): GrayImage {
  const width = Math.round(wIn * dpi);
  const height = Math.round(hIn * dpi);
  return { data: new Uint8Array(width * height).fill(255), width, height };
}

function fillPx(img: GrayImage, x: number, y: number, w: number, h: number, value = 0): void {
  for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++) img.data[yy * img.width + xx] = value;
  }
}

/** Fills a rect given in inches. */
function fill(img: GrayImage, xIn: number, yIn: number, wIn: number, hIn: number, value = 0): void {
  fillPx(img, px(xIn), px(yIn), px(xIn + wIn) - px(xIn), px(yIn + hIn) - px(yIn), value);
}

/** A 1 px outline around a rect given in inches. */
function border(img: GrayImage, xIn: number, yIn: number, wIn: number, hIn: number): void {
  const [x, y, w, h] = [px(xIn), px(yIn), px(xIn + wIn) - px(xIn), px(yIn + hIn) - px(yIn)];
  fillPx(img, x, y, w, 1);
  fillPx(img, x, y + h - 1, w, 1);
  fillPx(img, x, y, 1, h);
  fillPx(img, x + w - 1, y, 1, h);
}

/** Label-like content inside a wIn × hIn box: text lines, a barcode, a 2D code. */
function labelContent(img: GrayImage, xIn: number, yIn: number, wIn: number, hIn: number): void {
  const portrait = hIn > wIn;
  fill(img, xIn + 0.2, yIn + 0.2, wIn * 0.6, 0.12); // header text
  fill(img, xIn + 0.2, yIn + 0.5, 1.0, 1.0); // 2D code
  for (let i = 0; i < 4; i++) fill(img, xIn + 0.3, yIn + (portrait ? 2.2 : 1.7) + i * 0.25, wIn * 0.5, 0.1); // address
  const barTop = yIn + (portrait ? 3.6 : 2.9);
  for (let x = xIn + 0.4; x < xIn + wIn - 0.4; x += 0.12) fill(img, x, barTop, 0.06, 0.8); // barcode
}

/** Rows of text-like blocks and table rules, like a packing slip or instructions. */
function textBlock(img: GrayImage, xIn: number, yIn: number, wIn: number, hIn: number, withRules = false): void {
  for (let y = yIn; y < yIn + hIn - 0.15; y += 0.35) {
    fill(img, xIn, y, wIn * 0.7, 0.15);
    if (withRules) fill(img, xIn, y + 0.25, wIn, 1 / DPI);
  }
}

function expectRectNear(actual: PxRect | null, inches: [number, number, number, number], toleranceIn = 0.15): void {
  expect(actual).not.toBeNull();
  const got = [actual!.x, actual!.y, actual!.width, actual!.height].map((v) => v / DPI);
  got.forEach((v, i) => expect(Math.abs(v - inches[i]), `component ${i}: ${got.join(', ')}`).toBeLessThanOrEqual(toleranceIn));
}

describe('detectLabelRegion', () => {
  it('finds an eBay-style label above a packing slip', () => {
    const img = page(8.5, 11);
    border(img, 0.5, 0.5, 4, 6);
    labelContent(img, 0.5, 0.5, 4, 6);
    textBlock(img, 0.5, 7.0, 7.5, 3.5, true);

    expectRectNear(detectLabelRegion(img, DPI), [0.44, 0.44, 4.12, 6.12]);
  });

  it('finds a sideways UPS-style label above a dashed fold line and instructions', () => {
    const img = page(8.5, 11);
    border(img, 1.25, 0.6, 6, 4);
    labelContent(img, 1.25, 0.6, 6, 4);
    for (let x = 0; x < 8.5; x += 0.2) fill(img, x, 5.5, 0.1, 2 / DPI); // dashed, 50% coverage, 2 px
    textBlock(img, 0.5, 6.0, 7.5, 4.0);

    const rect = detectLabelRegion(img, DPI);
    expectRectNear(rect, [1.19, 0.54, 6.12, 4.12]);
    expect((rect!.y + rect!.height) / DPI).toBeLessThan(5.5);
  });

  it('erases a fold line that would otherwise join the label to the text below it', () => {
    const img = page(8.5, 11);
    border(img, 1.25, 0.5, 6, 4);
    labelContent(img, 1.25, 0.5, 6, 4);
    // Only 0.1 in of white on either side of the line: too little to split without erasing it.
    for (let x = 0; x < 8.5; x += 0.2) fill(img, x, 4.6, 0.1, 2 / DPI);
    textBlock(img, 0.5, 4.74, 7.5, 2.5);

    expectRectNear(detectLabelRegion(img, DPI), [1.19, 0.44, 6.12, 4.12]);
  });

  it('keeps a label in one piece when it has an empty band inside', () => {
    const img = page(8.5, 11);
    // No border: the label is held together only by its content.
    fill(img, 0.5, 0.5, 3.8, 0.3);
    fill(img, 0.5, 1.0, 2.0, 2.2);
    fill(img, 0.5, 3.5, 3.8, 2.8); // 0.3 in empty band above this block
    textBlock(img, 0.5, 6.9, 7.5, 3.5, true); // 0.6 in below the label

    expectRectNear(detectLabelRegion(img, DPI), [0.44, 0.44, 3.92, 5.92]);
  });

  it('returns null when nothing on the page is label-sized', () => {
    const img = page(8.5, 11);
    fill(img, 0.75, 4, 7, 2);
    expect(detectLabelRegion(img, DPI)).toBeNull();
  });

  it('returns null for a blank page', () => {
    expect(detectLabelRegion(page(8.5, 11), DPI)).toBeNull();
  });

  it('finds the content of a page that already is a label, clamped to the page', () => {
    const img = page(4, 6);
    border(img, 0.1, 0.1, 3.8, 5.8);
    labelContent(img, 0.1, 0.1, 3.8, 5.8);

    const rect = detectLabelRegion(img, DPI)!;
    expectRectNear(rect, [0.04, 0.04, 3.92, 5.92]);
    expect(rect.x + rect.width).toBeLessThanOrEqual(img.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(img.height);
  });

  it('prefers the label over a block of instructions that is roughly label-shaped', () => {
    const img = page(8.5, 11);
    border(img, 1.25, 0.6, 6, 4);
    labelContent(img, 1.25, 0.6, 6, 4);
    textBlock(img, 1.0, 5.5, 5.3, 4.4); // about 3.7 × 4.3 in
    expectRectNear(detectLabelRegion(img, DPI), [1.19, 0.54, 6.12, 4.12]);
  });
});

describe('contentArea', () => {
  it('pads the content of the page', () => {
    const img = page(8.5, 11);
    fill(img, 1, 2, 3, 1);
    fill(img, 5, 6, 1, 1);
    expectRectNear(contentArea(img, DPI), [0.9, 1.9, 5.2, 5.2], 0.03);
  });

  it('returns the whole page when it is blank', () => {
    const img = page(8.5, 11);
    expect(contentArea(img, DPI)).toEqual({ x: 0, y: 0, width: img.width, height: img.height });
  });
});

describe('peelUniformBorders', () => {
  it('removes a gray viewer frame and stops at the label border', () => {
    const img: GrayImage = { data: new Uint8Array(400 * 600).fill(86), width: 400, height: 600 };
    fillPx(img, 30, 30, 340, 540, 255); // white page
    fillPx(img, 30, 30, 340, 1, 0); // black border
    fillPx(img, 30, 569, 340, 1, 0);
    fillPx(img, 30, 30, 1, 540, 0);
    fillPx(img, 369, 30, 1, 540, 0);
    fillPx(img, 80, 100, 200, 50, 0); // content

    expect(peelUniformBorders(img)).toEqual({ x: 30, y: 30, width: 340, height: 540 });
  });

  it('peels through the gray frame and the white page margin down to the content', () => {
    const img: GrayImage = { data: new Uint8Array(500 * 700).fill(230), width: 500, height: 700 };
    fillPx(img, 40, 40, 420, 620, 255); // white page on a light gray background
    fillPx(img, 100, 120, 250, 30, 0);
    fillPx(img, 100, 500, 300, 80, 0);

    expect(peelUniformBorders(img)).toEqual({ x: 100, y: 120, width: 300, height: 460 });
  });

  it('returns the whole image when there is nothing to keep', () => {
    const img: GrayImage = { data: new Uint8Array(300 * 200).fill(255), width: 300, height: 200 };
    expect(peelUniformBorders(img)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });

  it('returns the whole image when the content is tiny', () => {
    const img: GrayImage = { data: new Uint8Array(300 * 200).fill(255), width: 300, height: 200 };
    fillPx(img, 100, 100, 10, 10, 0);
    expect(peelUniformBorders(img)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });

  it('keeps a full-bleed image untouched', () => {
    const img: GrayImage = { data: new Uint8Array(100 * 100), width: 100, height: 100 };
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37) % 256; // noise
    expect(peelUniformBorders(img)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe('pixel helpers', () => {
  it('converts RGBA to gray over white', () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255, //   opaque black
      255, 0, 0, 255, // opaque red
      0, 0, 0, 0, //     transparent
      0, 0, 0, 128, //   half-transparent black
    ]);
    expect([...toGray(rgba, 4, 1).data]).toEqual([0, 76, 255, 127]);
  });

  it('thresholds at the darkness cutoff, treating transparency as white', () => {
    const rgba = new Uint8ClampedArray([
      159, 159, 159, 255,
      160, 160, 160, 255,
      161, 161, 161, 255,
      0, 0, 0, 0,
    ]);
    expect(thresholdRgbaInPlace(rgba, 160)).toEqual({ blackPixels: 1 });
    expect([...rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  });

  it('finds ink bounds inside a region only', () => {
    const img = page(2, 2);
    fillPx(img, 10, 10, 5, 5);
    fillPx(img, 80, 80, 5, 5);
    expect(inkBounds(img, { x: 0, y: 0, width: 50, height: 50 })).toEqual({ x: 10, y: 10, width: 5, height: 5 });
    expect(inkBounds(img, { x: 20, y: 20, width: 50, height: 50 })).toBeNull();
  });

  it('converts between pixel and fractional rects', () => {
    const frac = pxRectToFrac({ x: 25, y: 50, width: 100, height: 200 }, 500, 1000);
    expect(frac).toEqual({ x: 0.05, y: 0.05, width: 0.2, height: 0.2 });
    expect(fracRectToPx(frac, 500, 1000)).toEqual({ x: 25, y: 50, width: 100, height: 200 });
  });
});

describe('detectLabelRegion crop size', () => {
  it('crops a label that fits within 4 × 6 at exactly 4 × 6, centered, so it prints at true size', () => {
    const img = page(8.5, 11);
    // Borderless label content, 3.5 × 5.5 in, at (1, 1); packing slip below.
    fill(img, 1, 1, 3.5, 0.3);
    fill(img, 1, 1.5, 1.2, 1.2);
    fill(img, 1, 3.2, 3.5, 3.3);
    textBlock(img, 0.5, 7.2, 7.5, 3.3, true);

    const rect = detectLabelRegion(img, DPI)!;
    expect([rect.width / DPI, rect.height / DPI]).toEqual([4, 6]);
    expectRectNear(rect, [0.75, 0.75, 4, 6], 0.03);
  });

  it('keeps a bordered 4 × 6 label at (almost exactly) true size', () => {
    const img = page(8.5, 11);
    border(img, 0.5, 0.5, 4, 6);
    labelContent(img, 0.5, 0.5, 4, 6);
    textBlock(img, 0.5, 7.0, 7.5, 3.5, true);
    const rect = detectLabelRegion(img, DPI)!;
    expect(rect.width / DPI).toBeGreaterThanOrEqual(4);
    expect(rect.width / DPI).toBeLessThanOrEqual(4.1); // scale ≥ 97%: "actual size"
    expect(rect.height / DPI).toBeLessThanOrEqual(6.1);
  });

  it('shifts the 4 × 6 window to stay on the page instead of shrinking it', () => {
    const img = page(8.5, 11);
    fill(img, 0.05, 0.05, 3.6, 5.6); // a solid label close to the top-left corner
    textBlock(img, 0.5, 7.0, 7.5, 3.5, true);
    const rect = detectLabelRegion(img, DPI)!;
    expect([rect.x, rect.y, rect.width / DPI, rect.height / DPI]).toEqual([0, 0, 4, 6]);
  });

  it('pads and scales down a label bigger than 4 × 6', () => {
    const img = page(8.5, 11);
    border(img, 0.5, 0.5, 4.4, 6.6);
    labelContent(img, 0.5, 0.5, 4.4, 6.6);
    expectRectNear(detectLabelRegion(img, DPI), [0.44, 0.44, 4.52, 6.72], 0.03);
  });

  it('uses a 6 × 4 window for a sideways label', () => {
    const img = page(8.5, 11);
    fill(img, 1.3, 1, 5.9, 3.9);
    textBlock(img, 0.5, 6.0, 7.5, 4.0);
    const rect = detectLabelRegion(img, DPI)!;
    expect([rect.width / DPI, rect.height / DPI]).toEqual([6, 4]);
  });
});
