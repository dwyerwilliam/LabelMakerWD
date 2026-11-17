import { describe, it, expect } from 'vitest';
import { getPageDimensions, calculateFitScale } from '@renderer/label/geometry';
import {
  PAGE_PORTRAIT_WIDTH_PT,
  PAGE_PORTRAIT_HEIGHT_PT,
  PAGE_PORTRAIT_WIDTH_PX,
  PAGE_PORTRAIT_HEIGHT_PX,
  PAGE_LANDSCAPE_WIDTH_PT,
  PAGE_LANDSCAPE_HEIGHT_PT,
  PAGE_LANDSCAPE_WIDTH_PX,
  PAGE_LANDSCAPE_HEIGHT_PX,
  SAFE_INSET_PT,
  SAFE_INSET_PX,
} from '@shared/defaults';

describe('Geometry and Units', () => {
  it('provides exact dimensions for portrait orientation', () => {
    const dims = getPageDimensions('portrait');
    expect(dims.widthPt).toBe(PAGE_PORTRAIT_WIDTH_PT); // 288 pt
    expect(dims.heightPt).toBe(PAGE_PORTRAIT_HEIGHT_PT); // 432 pt
    expect(dims.widthPx).toBe(PAGE_PORTRAIT_WIDTH_PX); // 384 px
    expect(dims.heightPx).toBe(PAGE_PORTRAIT_HEIGHT_PX); // 576 px
    expect(dims.safeInsetPt).toBe(SAFE_INSET_PT); // 9 pt
    expect(dims.safeInsetPx).toBe(SAFE_INSET_PX); // 12 px
    expect(dims.textWidthPt).toBe(270);
    expect(dims.textHeightPt).toBe(414);
  });

  it('provides exact dimensions for landscape orientation', () => {
    const dims = getPageDimensions('landscape');
    expect(dims.widthPt).toBe(PAGE_LANDSCAPE_WIDTH_PT); // 432 pt
    expect(dims.heightPt).toBe(PAGE_LANDSCAPE_HEIGHT_PT); // 288 pt
    expect(dims.widthPx).toBe(PAGE_LANDSCAPE_WIDTH_PX); // 576 px
    expect(dims.heightPx).toBe(PAGE_LANDSCAPE_HEIGHT_PX); // 384 px
    expect(dims.safeInsetPt).toBe(SAFE_INSET_PT); // 9 pt
    expect(dims.safeInsetPx).toBe(SAFE_INSET_PX); // 12 px
    expect(dims.textWidthPt).toBe(414);
    expect(dims.textHeightPt).toBe(270);
  });

  it('calculates fit scale maintaining aspect ratio', () => {
    // Container 1000 x 800 for portrait (384 x 576)
    const scale = calculateFitScale(1000, 800, 'portrait', 0);
    const expected = Math.min(1000 / 384, 800 / 576);
    expect(scale).toBeCloseTo(expected, 4);
  });
});
