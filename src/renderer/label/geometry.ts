import type { Orientation, PrinterProfile } from '@shared/contracts';
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
  TEXT_RECT_PORTRAIT_WIDTH_PT,
  TEXT_RECT_PORTRAIT_HEIGHT_PT,
  TEXT_RECT_PORTRAIT_WIDTH_PX,
  TEXT_RECT_PORTRAIT_HEIGHT_PX,
  TEXT_RECT_LANDSCAPE_WIDTH_PT,
  TEXT_RECT_LANDSCAPE_HEIGHT_PT,
  TEXT_RECT_LANDSCAPE_WIDTH_PX,
  TEXT_RECT_LANDSCAPE_HEIGHT_PX,
  SP310_PAGE_WIDTH_PT,
  SP310_PAGE_HEIGHT_PT,
  SP310_PAGE_WIDTH_PX,
  SP310_PAGE_HEIGHT_PX,
  SP310_TEXT_WIDTH_PT,
  SP310_TEXT_HEIGHT_PT,
  SP310_TEXT_WIDTH_PX,
  SP310_TEXT_HEIGHT_PX,
} from '@shared/defaults';

export interface PageDimensions {
  widthPt: number;
  heightPt: number;
  widthPx: number;
  heightPx: number;
  safeInsetPt: number;
  safeInsetPx: number;
  textWidthPt: number;
  textHeightPt: number;
  textWidthPx: number;
  textHeightPx: number;
}

export function getPageDimensions(orientation: Orientation): PageDimensions;
export function getPageDimensions(profile: PrinterProfile, orientation?: Orientation): PageDimensions;
export function getPageDimensions(
  profileOrOrientation: PrinterProfile | Orientation,
  requestedOrientation: Orientation = 'portrait'
): PageDimensions {
  const isLegacyOrientation = profileOrOrientation === 'portrait' || profileOrOrientation === 'landscape';
  const profile: PrinterProfile = isLegacyOrientation ? '4x6' : profileOrOrientation;
  const orientation: Orientation = isLegacyOrientation ? profileOrOrientation : requestedOrientation;

  if (profile === '2x1') {
    return {
      widthPt: SP310_PAGE_WIDTH_PT,
      heightPt: SP310_PAGE_HEIGHT_PT,
      widthPx: SP310_PAGE_WIDTH_PX,
      heightPx: SP310_PAGE_HEIGHT_PX,
      safeInsetPt: SAFE_INSET_PT,
      safeInsetPx: SAFE_INSET_PX,
      textWidthPt: SP310_TEXT_WIDTH_PT,
      textHeightPt: SP310_TEXT_HEIGHT_PT,
      textWidthPx: SP310_TEXT_WIDTH_PX,
      textHeightPx: SP310_TEXT_HEIGHT_PX,
    };
  }

  if (orientation === 'portrait') {
    return {
      widthPt: PAGE_PORTRAIT_WIDTH_PT,
      heightPt: PAGE_PORTRAIT_HEIGHT_PT,
      widthPx: PAGE_PORTRAIT_WIDTH_PX,
      heightPx: PAGE_PORTRAIT_HEIGHT_PX,
      safeInsetPt: SAFE_INSET_PT,
      safeInsetPx: SAFE_INSET_PX,
      textWidthPt: TEXT_RECT_PORTRAIT_WIDTH_PT,
      textHeightPt: TEXT_RECT_PORTRAIT_HEIGHT_PT,
      textWidthPx: TEXT_RECT_PORTRAIT_WIDTH_PX,
      textHeightPx: TEXT_RECT_PORTRAIT_HEIGHT_PX,
    };
  }

  return {
    widthPt: PAGE_LANDSCAPE_WIDTH_PT,
    heightPt: PAGE_LANDSCAPE_HEIGHT_PT,
    widthPx: PAGE_LANDSCAPE_WIDTH_PX,
    heightPx: PAGE_LANDSCAPE_HEIGHT_PX,
    safeInsetPt: SAFE_INSET_PT,
    safeInsetPx: SAFE_INSET_PX,
    textWidthPt: TEXT_RECT_LANDSCAPE_WIDTH_PT,
    textHeightPt: TEXT_RECT_LANDSCAPE_HEIGHT_PT,
    textWidthPx: TEXT_RECT_LANDSCAPE_WIDTH_PX,
    textHeightPx: TEXT_RECT_LANDSCAPE_HEIGHT_PX,
  };
}

/**
 * Calculates scale factor so that the label fits cleanly inside the available container
 * while maintaining exact 4:6 (or 6:4) aspect ratio and leaving margin.
 */
export function calculateFitScale(
  containerWidth: number,
  containerHeight: number,
  profileOrOrientation: PrinterProfile | Orientation,
  orientationOrPadding: Orientation | number = 0,
  paddingPx = 32
): number {
  const isLegacyOrientation = profileOrOrientation === 'portrait' || profileOrOrientation === 'landscape';
  const profile: PrinterProfile = isLegacyOrientation ? '4x6' : profileOrOrientation;
  const orientation: Orientation = isLegacyOrientation
    ? profileOrOrientation
    : typeof orientationOrPadding === 'number' ? 'landscape' : orientationOrPadding;
  const effectivePadding = isLegacyOrientation && typeof orientationOrPadding === 'number'
    ? orientationOrPadding
    : paddingPx;
  const { widthPx, heightPx } = getPageDimensions(profile, orientation);
  const availableW = Math.max(100, containerWidth - effectivePadding * 2);
  const availableH = Math.max(100, containerHeight - effectivePadding * 2);

  const scaleW = availableW / widthPx;
  const scaleH = availableH / heightPx;

  return Math.min(scaleW, scaleH);
}
