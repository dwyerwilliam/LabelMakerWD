import type { PreferencesV2, PrinterProfile } from './contracts';

export const STOCK_WIDTH_IN = 4.0;
export const STOCK_HEIGHT_IN = 6.0;
export const SP310_OUTPUT_WIDTH_IN = 2.25;
export const SP310_OUTPUT_HEIGHT_IN = 1.25;

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

// SP310 / DYMO 30334 output is landscape: 2.25in wide x 1.25in high.
export const SP310_PAGE_WIDTH_PT = SP310_OUTPUT_WIDTH_IN * POINTS_PER_INCH; // 162 pt
export const SP310_PAGE_HEIGHT_PT = SP310_OUTPUT_HEIGHT_IN * POINTS_PER_INCH; // 90 pt
export const SP310_PAGE_WIDTH_PX = SP310_OUTPUT_WIDTH_IN * CSS_PX_PER_INCH; // 216 px
export const SP310_PAGE_HEIGHT_PX = SP310_OUTPUT_HEIGHT_IN * CSS_PX_PER_INCH; // 120 px
export const SP310_TEXT_WIDTH_PT = SP310_PAGE_WIDTH_PT - 2 * SAFE_INSET_PT; // 144 pt
export const SP310_TEXT_HEIGHT_PT = SP310_PAGE_HEIGHT_PT - 2 * SAFE_INSET_PT; // 72 pt
export const SP310_TEXT_WIDTH_PX = SP310_PAGE_WIDTH_PX - 2 * SAFE_INSET_PX; // 192 px
export const SP310_TEXT_HEIGHT_PX = SP310_PAGE_HEIGHT_PX - 2 * SAFE_INSET_PX; // 96 px

export const LINE_HEIGHT_MULTIPLIER = 1.2;
export const MIN_FONT_SIZE_PT = 6.0;
export const MAX_FONT_SIZE_PT = 288.0;
export const FONT_SIZE_STEP_PT = 0.5;

// Upper bound on measured lines in a layout fingerprint received over IPC. A real
// label shows well under a hundred lines; the cap just keeps a malformed payload
// from forcing validation of an enormous array.
export const MAX_LAYOUT_LINES = 100_000;

export const MIN_COPIES = 1;
export const MAX_COPIES = 99;

export const PRINTER_PROFILES: PrinterProfile[] = ['4x6', '2x1'];

export function createDefaultPreferences(): PreferencesV2 {
  return {
    schemaVersion: 2,
    activeProfile: '4x6',
    profiles: {
      '4x6': {
        orientation: 'portrait',
        fontFamily: 'Arial',
        fontSizePt: 24,
        alignment: 'center',
        printer: null,
      },
      '2x1': {
        orientation: 'landscape',
        fontFamily: 'Arial',
        fontSizePt: 12,
        alignment: 'center',
        printer: null,
      },
    },
  };
}

export const DEFAULT_PREFERENCES: PreferencesV2 = createDefaultPreferences();
