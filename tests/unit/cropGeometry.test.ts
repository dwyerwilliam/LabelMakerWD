import { describe, it, expect } from 'vitest';
import { drawCrop, keyboardCrop, moveCrop, resizeCrop } from '@renderer/shipping/cropGeometry';
import type { FracRect } from '@shared/shipping';

const box: FracRect = { x: 0.2, y: 0.3, width: 0.4, height: 0.3 };

function expectRect(actual: FracRect | null, expected: FracRect): void {
  expect(actual).not.toBeNull();
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(actual![key], key).toBeCloseTo(expected[key], 9);
}

describe('moveCrop', () => {
  it('moves the box and keeps its size', () => {
    expectRect(moveCrop(box, 0.1, -0.1), { x: 0.3, y: 0.2, width: 0.4, height: 0.3 });
  });

  it('stops at the page edges', () => {
    expectRect(moveCrop(box, 0.9, 0.9), { x: 0.6, y: 0.7, width: 0.4, height: 0.3 });
    expectRect(moveCrop(box, -0.9, -0.9), { x: 0, y: 0, width: 0.4, height: 0.3 });
  });
});

describe('resizeCrop', () => {
  it('moves only the dragged edges', () => {
    expectRect(resizeCrop(box, 'e', 0.1, 0.5, 0.05, 0.05), { x: 0.2, y: 0.3, width: 0.5, height: 0.3 });
    expectRect(resizeCrop(box, 'n', 0.5, -0.1, 0.05, 0.05), { x: 0.2, y: 0.2, width: 0.4, height: 0.4 });
    expectRect(resizeCrop(box, 'sw', -0.1, 0.1, 0.05, 0.05), { x: 0.1, y: 0.3, width: 0.5, height: 0.4 });
  });

  it('never goes past the page or below the minimum size', () => {
    expectRect(resizeCrop(box, 'nw', -1, -1, 0.05, 0.05), { x: 0, y: 0, width: 0.6, height: 0.6 });
    expectRect(resizeCrop(box, 'se', 1, 1, 0.05, 0.05), { x: 0.2, y: 0.3, width: 0.8, height: 0.7 });
    // Dragging the left edge past the right edge stops at the minimum width.
    expectRect(resizeCrop(box, 'w', 0.9, 0, 0.1, 0.1), { x: 0.5, y: 0.3, width: 0.1, height: 0.3 });
  });
});

describe('drawCrop', () => {
  it('draws a box in any direction', () => {
    expectRect(drawCrop(0.6, 0.7, 0.2, 0.1, 0.05, 0.05), { x: 0.2, y: 0.1, width: 0.4, height: 0.6 });
  });

  it('clamps to the page and grows a click into the minimum size', () => {
    expectRect(drawCrop(-0.5, 0.5, 1.5, 0.6, 0.05, 0.05), { x: 0, y: 0.5, width: 1, height: 0.1 });
    expectRect(drawCrop(0.99, 0.99, 0.99, 0.99, 0.1, 0.1), { x: 0.9, y: 0.9, width: 0.1, height: 0.1 });
  });
});

describe('keyboardCrop', () => {
  it('moves the box with the arrow keys', () => {
    expectRect(keyboardCrop(box, 'ArrowRight', false, 0.05, 0.05), { x: 0.21, y: 0.3, width: 0.4, height: 0.3 });
    expectRect(keyboardCrop(box, 'ArrowUp', false, 0.05, 0.05), { x: 0.2, y: 0.29, width: 0.4, height: 0.3 });
  });

  it('resizes from the right and bottom edges with Shift', () => {
    expectRect(keyboardCrop(box, 'ArrowRight', true, 0.05, 0.05), { x: 0.2, y: 0.3, width: 0.41, height: 0.3 });
    expectRect(keyboardCrop(box, 'ArrowLeft', true, 0.05, 0.05), { x: 0.2, y: 0.3, width: 0.39, height: 0.3 });
    expectRect(keyboardCrop(box, 'ArrowDown', true, 0.05, 0.05), { x: 0.2, y: 0.3, width: 0.4, height: 0.31 });
  });

  it('ignores other keys', () => {
    expect(keyboardCrop(box, 'Enter', false, 0.05, 0.05)).toBeNull();
    expect(keyboardCrop(box, 'a', true, 0.05, 0.05)).toBeNull();
  });
});
