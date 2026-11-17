import type { PreferencesV1 } from './contracts';

export const STOCK_WIDTH_IN = 4.0;
export const STOCK_HEIGHT_IN = 6.0;

export const SAFE_INSET_IN = 0.125; // 1/8 inch
export const POINTS_PER_INCH = 72;
export const CSS_PX_PER_INCH = 96;

// Portrait: 4in x 6in
export const PAGE_PORTRAIT_WIDTH_PT = STOCK_WIDTH_IN * POINTS_PER_INCH; // 288 pt
export const PAGE_PORTRAIT_HEIGHT_PT = STOCK_HEIGHT_IN * POINTS_PER_INCH; // 432 pt
export const PAGE_PORTRAIT_WIDTH_PX = STOCK_WIDTH_IN * CSS_PX_PER_INCH; // 384 px
export const PAGE_PORTRAIT_HEIGHT_PX = STOCK_HEIGHT_IN * CSS_PX_PER_INCH; // 576 px

// Landscape: 6in x 4in
export const PAGE_LANDSCAPE_WIDTH_PT = STOCK_HEIGHT_IN * POINTS_PER_INCH; // 432 pt
export const PAGE_LANDSCAPE_HEIGHT_PT = STOCK_WIDTH_IN * POINTS_PER_INCH; // 288 pt
export const PAGE_LANDSCAPE_WIDTH_PX = STOCK_HEIGHT_IN * CSS_PX_PER_INCH; // 576 px
export const PAGE_LANDSCAPE_HEIGHT_PX = STOCK_WIDTH_IN * CSS_PX_PER_INCH; // 384 px

// Safe insets: 0.125 in = 9 pt = 12 CSS px
export const SAFE_INSET_PT = SAFE_INSET_IN * POINTS_PER_INCH; // 9 pt
export const SAFE_INSET_PX = SAFE_INSET_IN * CSS_PX_PER_INCH; // 12 px

// Text rects:
export const TEXT_RECT_PORTRAIT_WIDTH_PT = PAGE_PORTRAIT_WIDTH_PT - 2 * SAFE_INSET_PT; // 270 pt
export const TEXT_RECT_PORTRAIT_HEIGHT_PT = PAGE_PORTRAIT_HEIGHT_PT - 2 * SAFE_INSET_PT; // 414 pt
export const TEXT_RECT_PORTRAIT_WIDTH_PX = PAGE_PORTRAIT_WIDTH_PX - 2 * SAFE_INSET_PX; // 360 px
export const TEXT_RECT_PORTRAIT_HEIGHT_PX = PAGE_PORTRAIT_HEIGHT_PX - 2 * SAFE_INSET_PX; // 552 px

export const TEXT_RECT_LANDSCAPE_WIDTH_PT = PAGE_LANDSCAPE_WIDTH_PT - 2 * SAFE_INSET_PT; // 414 pt
export const TEXT_RECT_LANDSCAPE_HEIGHT_PT = PAGE_LANDSCAPE_HEIGHT_PT - 2 * SAFE_INSET_PT; // 270 pt
export const TEXT_RECT_LANDSCAPE_WIDTH_PX = PAGE_LANDSCAPE_WIDTH_PX - 2 * SAFE_INSET_PX; // 552 px
export const TEXT_RECT_LANDSCAPE_HEIGHT_PX = PAGE_LANDSCAPE_HEIGHT_PX - 2 * SAFE_INSET_PX; // 360 px

export const LINE_HEIGHT_MULTIPLIER = 1.2;
export const MIN_FONT_SIZE_PT = 6.0;
export const MAX_FONT_SIZE_PT = 288.0;
export const FONT_SIZE_STEP_PT = 0.5;

export const MIN_COPIES = 1;
export const MAX_COPIES = 99;

export const DEFAULT_PREFERENCES: PreferencesV1 = {
  schemaVersion: 1,
  orientation: 'portrait',
  fontFamily: 'Arial',
  fontSizePt: 24,
  alignment: 'center',
  printer: null,
};
