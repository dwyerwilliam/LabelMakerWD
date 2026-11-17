import { describe, it, expect } from 'vitest';
import {
  addRotation,
  bytesToBase64,
  clampFracRect,
  fitToLabel,
  isOffAspect,
  readPngDimensions,
  rotatedSize,
  SHIPPING_DPI,
  SHIPPING_HEIGHT_IN,
  SHIPPING_HEIGHT_PX,
  SHIPPING_WIDTH_IN,
  SHIPPING_WIDTH_PX,
} from '@shared/shipping';
import { pngHeader } from './support/png';

describe('shipping constants', () => {
  it('describes a 4 × 6 in label at the SP410 resolution', () => {
    expect(SHIPPING_WIDTH_PX).toBe(SHIPPING_WIDTH_IN * SHIPPING_DPI);
    expect(SHIPPING_HEIGHT_PX).toBe(SHIPPING_HEIGHT_IN * SHIPPING_DPI);
    expect([SHIPPING_WIDTH_PX, SHIPPING_HEIGHT_PX]).toEqual([812, 1218]);
  });
});

describe('readPngDimensions', () => {
  it('reads the size from a PNG header', () => {
    expect(readPngDimensions(pngHeader(812, 1218))).toEqual({ width: 812, height: 1218 });
  });

  it('works on a view that does not start at the beginning of its buffer', () => {
    const padded = new Uint8Array(40);
    padded.set(pngHeader(100, 200), 7);
    expect(readPngDimensions(padded.subarray(7))).toEqual({ width: 100, height: 200 });
  });

  it('rejects anything that is not a PNG', () => {
    expect(readPngDimensions(new Uint8Array(0))).toBeNull();
    expect(readPngDimensions(new Uint8Array(29).fill(7))).toBeNull();
    expect(readPngDimensions(pngHeader(812, 1218).subarray(0, 20))).toBeNull();
    const wrongChunk = pngHeader(812, 1218);
    wrongChunk[12] = 0x58; // "XHDR"
    expect(readPngDimensions(wrongChunk)).toBeNull();
  });
});

describe('fitToLabel', () => {
  it('scales an exact 4 × 6 box to fill the label', () => {
    expect(fitToLabel(406, 609)).toEqual({ width: 812, height: 1218, offsetX: 0, offsetY: 0, scale: 2 });
  });

  it('centers a square vertically', () => {
    const fit = fitToLabel(1000, 1000);
    expect([fit.width, fit.height, fit.offsetX, fit.offsetY]).toEqual([812, 812, 0, 203]);
    expect(fit.scale).toBeCloseTo(0.812);
  });

  it('centers a landscape box vertically and never stretches it', () => {
    const fit = fitToLabel(1218, 812);
    expect([fit.width, fit.height, fit.offsetX, fit.offsetY]).toEqual([812, 541, 0, 338]);
  });

  it('centers a tall narrow box horizontally', () => {
    const fit = fitToLabel(100, 300);
    expect([fit.width, fit.height, fit.offsetX, fit.offsetY]).toEqual([406, 1218, 203, 0]);
  });
});

describe('clampFracRect', () => {
  it('keeps a rect inside the page', () => {
    expect(clampFracRect({ x: 0.8, y: -0.2, width: 0.5, height: 0.5 }, 0.1, 0.1)).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
  });

  it('enforces the minimum size and never exceeds the page', () => {
    expect(clampFracRect({ x: 0.99, y: 0.5, width: 0.01, height: 2 }, 0.1, 0.1)).toEqual({
      x: 0.9,
      y: 0,
      width: 0.1,
      height: 1,
    });
  });
});

describe('rotation helpers', () => {
  it('swaps width and height for quarter turns only', () => {
    expect(rotatedSize(3, 5, 0)).toEqual({ w: 3, h: 5 });
    expect(rotatedSize(3, 5, 90)).toEqual({ w: 5, h: 3 });
    expect(rotatedSize(3, 5, 180)).toEqual({ w: 3, h: 5 });
    expect(rotatedSize(3, 5, 270)).toEqual({ w: 5, h: 3 });
  });

  it('wraps rotation in both directions', () => {
    expect(addRotation(0, -90)).toBe(270);
    expect(addRotation(270, 90)).toBe(0);
    expect(addRotation(90, 90)).toBe(180);
  });
});

describe('isOffAspect', () => {
  it('accepts shapes close to 4 × 6 portrait', () => {
    expect(isOffAspect(4, 6)).toBe(false);
    expect(isOffAspect(4, 6.6)).toBe(false); // 10% taller
  });

  it('flags shapes far from 4 × 6 portrait', () => {
    expect(isOffAspect(4, 7)).toBe(true); // 17% taller
    expect(isOffAspect(6, 4)).toBe(true); // landscape
    expect(isOffAspect(1, 1)).toBe(true);
  });
});

describe('bytesToBase64', () => {
  it('matches Node for small and chunk-crossing inputs', () => {
    for (const length of [0, 1, 2, 3, 100, 0x8000 + 5, 100_000]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 31 + 7) & 0xff);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
