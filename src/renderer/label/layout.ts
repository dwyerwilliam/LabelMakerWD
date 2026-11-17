import type { LayoutFingerprint, Orientation, PrinterProfile } from '@shared/contracts';
import { getPageDimensions } from './geometry';

const PT_PER_PX = 72 / 96; // 0.75

function getAncestorVisualScale(element: HTMLElement): number {
  let scale = 1;
  let ancestor = element.parentElement;

  while (ancestor) {
    const transform = window.getComputedStyle(ancestor).transform;
    if (transform && transform !== 'none') {
      const matrix = transform.match(/^matrix\(([^)]+)\)$/);
      if (matrix) {
        const values = matrix[1].split(',').map(Number);
        const [a = 1, b = 0, c = 0, d = 1] = values;
        const scaleX = Math.hypot(a, b);
        const scaleY = Math.hypot(c, d);
        scale *= (scaleX + scaleY) / 2;
      }
    }
    ancestor = ancestor.parentElement;
  }

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function pxToPt(px: number): number {
  return px * PT_PER_PX;
}

export function ptToPx(pt: number): number {
  return pt / PT_PER_PX;
}

export function measureLayoutFingerprint(
  textContainerEl: HTMLElement,
  profileOrOrientation: PrinterProfile | Orientation,
  requestedOrientation: Orientation = 'portrait',
  physicalLandscapeRotation = false
): LayoutFingerprint {
  const isLegacyOrientation = profileOrOrientation === 'portrait' || profileOrOrientation === 'landscape';
  const profile: PrinterProfile = isLegacyOrientation ? '4x6' : profileOrOrientation;
  const orientation: Orientation = isLegacyOrientation ? profileOrOrientation : requestedOrientation;
  const dims = getPageDimensions(profile, orientation);
  const safeHeightPx = dims.textHeightPx;
  const safeWidthPx = dims.textWidthPx;
  const visualScale = getAncestorVisualScale(textContainerEl);

  // Measure content bounds
  const scrollHeight = textContainerEl.scrollHeight;
  const clientHeight = textContainerEl.clientHeight;
  // scrollHeight/clientHeight are in the element's untransformed coordinate
  // space. getBoundingClientRect() includes the preview fit-to-window scale.
  const contentHeightPx = Math.max(scrollHeight, clientHeight);

  // Overflow occurs if content height exceeds safe text area height (with 0.5px float tolerance)
  const overflow = contentHeightPx > safeHeightPx + 0.5;

  // Extract individual line rects and offsets using Range
  const lineRectsPt: Array<{ x: number; y: number; width: number; height: number }> = [];
  const lineTextOffsets: number[] = [];

  const containerRect = textContainerEl.getBoundingClientRect();
  const textNode = textContainerEl.firstChild;

  const toLogicalLineRect = (
    lineMinX: number,
    lineMinY: number,
    lineMaxX: number,
    lineMaxY: number
  ) => {
    const xPx = (lineMinX - containerRect.left) / visualScale;
    const yPx = (lineMinY - containerRect.top) / visualScale;
    const widthPx = (lineMaxX - lineMinX) / visualScale;
    const heightPx = (lineMaxY - lineMinY) / visualScale;

    if (physicalLandscapeRotation && orientation === 'landscape') {
      const rotatedContainerWidthPx = containerRect.width / visualScale;
      return {
        x: pxToPt(yPx),
        y: pxToPt(rotatedContainerWidthPx - xPx - widthPx),
        width: pxToPt(heightPx),
        height: pxToPt(widthPx),
      };
    }

    return {
      x: pxToPt(xPx),
      y: pxToPt(yPx),
      width: pxToPt(widthPx),
      height: pxToPt(heightPx),
    };
  };

  if (textNode && textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
    const text = textNode.textContent;
    let currentLineCoordinate = -99999;
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

      // Rotated landscape text advances along the physical y-axis, which is
      // the source element's x-axis after rotation. Detect breaks on the
      // corresponding coordinate before mapping back to logical landscape.
      const lineCoordinate = physicalLandscapeRotation && orientation === 'landscape'
        ? rect.left
        : rect.top;

      // Check if this character is on a new line (offset difference > half line height)
      if (currentLineCoordinate === -99999) {
        currentLineCoordinate = lineCoordinate;
        currentLineStart = i;
        lineMinX = rect.left;
        lineMaxX = rect.right;
        lineMinY = rect.top;
        lineMaxY = rect.bottom;
      } else if (Math.abs(lineCoordinate - currentLineCoordinate) > 3) {
        // Line broke: record previous line
        lineTextOffsets.push(currentLineStart);
        lineRectsPt.push(toLogicalLineRect(lineMinX, lineMinY, lineMaxX, lineMaxY));

        currentLineCoordinate = lineCoordinate;
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
    if (currentLineCoordinate !== -99999) {
      lineTextOffsets.push(currentLineStart);
      lineRectsPt.push(toLogicalLineRect(lineMinX, lineMinY, lineMaxX, lineMaxY));
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
    const fields = ['x', 'y', 'width', 'height'] as const;
    const mismatchedField = fields.find((field) => Math.abs(r1[field] - r2[field]) > tolerancePt);
    if (mismatchedField) {
      return {
        match: false,
        reason: `Line ${i} ${mismatchedField} mismatch: ${r1[mismatchedField].toFixed(3)} vs ${r2[mismatchedField].toFixed(3)}pt (tolerance ${tolerancePt}pt)`,
      };
    }
  }

  return { match: true };
}
