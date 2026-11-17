import type { LayoutFingerprint, Orientation } from '@shared/contracts';
import { getPageDimensions } from './geometry';

const PT_PER_PX = 72 / 96; // 0.75

export function pxToPt(px: number): number {
  return px * PT_PER_PX;
}

export function ptToPx(pt: number): number {
  return pt / PT_PER_PX;
}

export function measureLayoutFingerprint(
  textContainerEl: HTMLElement,
  orientation: Orientation
): LayoutFingerprint {
  const dims = getPageDimensions(orientation);
  const safeHeightPx = dims.textHeightPx;
  const safeWidthPx = dims.textWidthPx;

  // Measure content bounds
  const scrollHeight = textContainerEl.scrollHeight;
  const clientHeight = textContainerEl.clientHeight;
  const boundingHeight = textContainerEl.getBoundingClientRect().height;
  const contentHeightPx = Math.max(scrollHeight, clientHeight, boundingHeight);

  // Overflow occurs if content height exceeds safe text area height (with 0.5px float tolerance)
  const overflow = contentHeightPx > safeHeightPx + 0.5;

  // Extract individual line rects and offsets using Range
  const lineRectsPt: Array<{ x: number; y: number; width: number; height: number }> = [];
  const lineTextOffsets: number[] = [];

  const containerRect = textContainerEl.getBoundingClientRect();
  const textNode = textContainerEl.firstChild;

  if (textNode && textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
    const text = textNode.textContent;
    let currentLineTop = -99999;
    let currentLineStart = 0;
    let lineMinX = 99999;
    let lineMaxX = -99999;
    let lineMinY = 99999;
    let lineMaxY = -99999;

    const range = document.createRange();

    for (let i = 0; i < text.length; i++) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rect = range.getBoundingClientRect();

      if (rect.width === 0 && rect.height === 0) {
        continue;
      }

      // Check if this character is on a new line (y offset difference > half line height)
      if (currentLineTop === -99999) {
        currentLineTop = rect.top;
        currentLineStart = i;
        lineMinX = rect.left;
        lineMaxX = rect.right;
        lineMinY = rect.top;
        lineMaxY = rect.bottom;
      } else if (Math.abs(rect.top - currentLineTop) > 3) {
        // Line broke: record previous line
        lineTextOffsets.push(currentLineStart);
        lineRectsPt.push({
          x: pxToPt(lineMinX - containerRect.left),
          y: pxToPt(lineMinY - containerRect.top),
          width: pxToPt(lineMaxX - lineMinX),
          height: pxToPt(lineMaxY - lineMinY),
        });

        currentLineTop = rect.top;
        currentLineStart = i;
        lineMinX = rect.left;
        lineMaxX = rect.right;
        lineMinY = rect.top;
        lineMaxY = rect.bottom;
      } else {
        lineMinX = Math.min(lineMinX, rect.left);
        lineMaxX = Math.max(lineMaxX, rect.right);
        lineMinY = Math.min(lineMinY, rect.top);
        lineMaxY = Math.max(lineMaxY, rect.bottom);
      }
    }

    // Push final line
    if (currentLineTop !== -99999) {
      lineTextOffsets.push(currentLineStart);
      lineRectsPt.push({
        x: pxToPt(lineMinX - containerRect.left),
        y: pxToPt(lineMinY - containerRect.top),
        width: pxToPt(lineMaxX - lineMinX),
        height: pxToPt(lineMaxY - lineMinY),
      });
    }
  }

  // Fallback if no text or rects
  if (lineRectsPt.length === 0) {
    lineRectsPt.push({
      x: 0,
      y: 0,
      width: pxToPt(safeWidthPx),
      height: pxToPt(contentHeightPx),
    });
    lineTextOffsets.push(0);
  }

  return {
    logicalWidthPt: dims.widthPt,
    logicalHeightPt: dims.heightPt,
    lineRectsPt,
    lineTextOffsets,
    overflow,
  };
}

export function compareFingerprints(
  f1: LayoutFingerprint,
  f2: LayoutFingerprint,
  tolerancePt = 0.05
): { match: boolean; reason?: string } {
  if (Math.abs(f1.logicalWidthPt - f2.logicalWidthPt) > tolerancePt) {
    return { match: false, reason: `Width mismatch: ${f1.logicalWidthPt} vs ${f2.logicalWidthPt}` };
  }

  if (Math.abs(f1.logicalHeightPt - f2.logicalHeightPt) > tolerancePt) {
    return { match: false, reason: `Height mismatch: ${f1.logicalHeightPt} vs ${f2.logicalHeightPt}` };
  }

  if (f1.overflow !== f2.overflow) {
    return { match: false, reason: `Overflow flag mismatch: ${f1.overflow} vs ${f2.overflow}` };
  }

  if (f1.lineTextOffsets.length !== f2.lineTextOffsets.length) {
    return {
      match: false,
      reason: `Line count mismatch: ${f1.lineTextOffsets.length} vs ${f2.lineTextOffsets.length}`,
    };
  }

  for (let i = 0; i < f1.lineTextOffsets.length; i++) {
    if (f1.lineTextOffsets[i] !== f2.lineTextOffsets[i]) {
      return {
        match: false,
        reason: `Line ${i} offset mismatch: ${f1.lineTextOffsets[i]} vs ${f2.lineTextOffsets[i]}`,
      };
    }

    const r1 = f1.lineRectsPt[i];
    const r2 = f2.lineRectsPt[i];
    if (
      Math.abs(r1.x - r2.x) > tolerancePt ||
      Math.abs(r1.y - r2.y) > tolerancePt ||
      Math.abs(r1.width - r2.width) > tolerancePt ||
      Math.abs(r1.height - r2.height) > tolerancePt
    ) {
      return {
        match: false,
        reason: `Line ${i} rect mismatch exceeds tolerance of ${tolerancePt}pt`,
      };
    }
  }

  return { match: true };
}
