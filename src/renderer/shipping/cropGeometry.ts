// Pure geometry for the crop box in the crop dialog. Everything is in fractions (0–1) of the page
// or image, and every result stays inside the page and at least minW × minH.
import { clampFracRect, type FracRect } from '@shared/shipping';

/** Edges a handle moves: n = top, s = bottom, w = left, e = right; corners combine two. */
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** The keyboard step: 1% of the page. */
export const KEY_STEP = 0.01;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Moves the whole box, keeping its size and stopping at the page edges. */
export function moveCrop(start: FracRect, dx: number, dy: number): FracRect {
  return clampFracRect({ ...start, x: start.x + dx, y: start.y + dy }, 0, 0);
}

/** Drags one edge or corner; the opposite edges stay put. */
export function resizeCrop(start: FracRect, handle: Handle, dx: number, dy: number, minW: number, minH: number): FracRect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = Math.min(Math.max(0, left + dx), right - minW);
  if (handle.includes('e')) right = Math.max(Math.min(1, right + dx), left + minW);
  if (handle.includes('n')) top = Math.min(Math.max(0, top + dy), bottom - minH);
  if (handle.includes('s')) bottom = Math.max(Math.min(1, bottom + dy), top + minH);
  return clampFracRect({ x: left, y: top, width: right - left, height: bottom - top }, minW, minH);
}

/** A new box drawn from point a to point b, in any direction. */
export function drawCrop(ax: number, ay: number, bx: number, by: number, minW: number, minH: number): FracRect {
  const [x1, x2] = [clamp01(Math.min(ax, bx)), clamp01(Math.max(ax, bx))];
  const [y1, y2] = [clamp01(Math.min(ay, by)), clamp01(Math.max(ay, by))];
  return clampFracRect({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, minW, minH);
}

/**
 * Arrow keys move the box by 1% of the page; Shift + Left/Right moves the right edge and
 * Shift + Up/Down the bottom edge. Returns null for keys it does not handle.
 */
export function keyboardCrop(crop: FracRect, key: string, shift: boolean, minW: number, minH: number): FracRect | null {
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-KEY_STEP, 0],
    ArrowRight: [KEY_STEP, 0],
    ArrowUp: [0, -KEY_STEP],
    ArrowDown: [0, KEY_STEP],
  };
  const d = delta[key];
  if (!d) return null;
  if (!shift) return moveCrop(crop, d[0], d[1]);
  return resizeCrop(crop, d[0] !== 0 ? 'e' : 's', d[0], d[1], minW, minH);
}
