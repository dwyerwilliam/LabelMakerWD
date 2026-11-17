import { test, expect, type Browser } from '@playwright/test';
import { installMockApi } from './support/mockApi';
import { compareFingerprints } from '../../src/renderer/label/layout';
import type { LayoutFingerprint } from '../../src/shared/contracts';

// Acceptance A09: text that wraps must wrap the same way at any window size and display scale.
// The preview is scaled to fit the window; the label's own layout must not depend on that.

const TEXT = 'The quick brown fox jumps over the lazy dog,\nthen keeps running through the long field of tall grass\n\nSupercalifragilisticexpialidocious end';

const WINDOWS = [
  { name: '800 × 600', viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 },
  { name: '1100 × 760', viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 },
  { name: '1600 × 900', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 },
  { name: '1100 × 760 at 150%', viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1.5 },
  { name: '1100 × 760 at 200%', viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 },
];

const LAYOUTS = [
  { name: '4 × 6 portrait', tab: '4 × 6', orientation: 'Portrait', button: 'Print 4 × 6' },
  { name: '4 × 6 landscape', tab: '4 × 6', orientation: 'Landscape', button: 'Print 4 × 6' },
  { name: '2 × 1', tab: '2 × 1', orientation: null, button: 'Print 2 × 1' },
] as const;

async function measure(browser: Browser, window: (typeof WINDOWS)[number], layout: (typeof LAYOUTS)[number]): Promise<LayoutFingerprint> {
  const context = await browser.newContext({ viewport: window.viewport, deviceScaleFactor: window.deviceScaleFactor });
  try {
    const page = await context.newPage();
    await installMockApi(page, { queues: ['4x6', '2x1'] });
    await page.goto('/');
    await page.getByRole('tab', { name: layout.tab }).click();
    if (layout.orientation) await page.getByRole('button', { name: layout.orientation, exact: true }).click();

    const editor = page.getByRole('textbox', { name: 'Label text editor' });
    await editor.click();
    await editor.fill(TEXT);
    const print = page.getByRole('button', { name: layout.button, exact: true });
    await expect(print).toBeEnabled();
    await print.click();

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __mock: { calls: { prepare: number } } }).__mock.calls.prepare))
      .toBe(1);
    const snapshot = await page.evaluate(
      () => (window as unknown as { __mock: { lastSnapshot: { expectedLayout: unknown } } }).__mock.lastSnapshot
    );
    return snapshot.expectedLayout as LayoutFingerprint;
  } finally {
    await context.close();
  }
}

for (const layout of LAYOUTS) {
  test(`${layout.name}: lines break in the same places at every window size and display scale`, async ({ browser }) => {
    const reference = await measure(browser, WINDOWS[1], layout);
    // The sample really wraps, so the comparison means something.
    expect(reference.lineTextOffsets.length, 'the sample text wraps onto several lines').toBeGreaterThan(4);

    for (const window of WINDOWS) {
      const measured = await measure(browser, window, layout);
      expect(measured.lineTextOffsets, `line starts at ${window.name}`).toEqual(reference.lineTextOffsets);
      expect(measured.overflow, `overflow at ${window.name}`).toBe(reference.overflow);
      const comparison = compareFingerprints(reference, measured, 0.05);
      expect(comparison, `line geometry at ${window.name}`).toEqual({ match: true });
    }
  });
}
