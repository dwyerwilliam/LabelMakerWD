import { test, expect } from '@playwright/test';
import { installPrintApi, makeImageJob, makeJob, makeLabelPng, sendJob } from './support/printPage';

// The hidden print window measures every label it is given and reports whether the text
// overflows. That report decides whether the user is asked "Print Clipped Label?", so it
// has to describe the label that was just sent, not the one before it and not the layout
// the window happened to show first.

const lines = (count: number) => Array.from({ length: count }, (_, i) => `Line ${i + 1}`).join('\n');

test.beforeEach(async ({ page }) => {
  await installPrintApi(page);
  await page.goto('/print.html');
  await page.bringToFront();
});

test('overflow is reported correctly whichever layout the print window showed first', async ({ page }) => {
  const tall = lines(20); // 20 lines at 24 pt do not fit a 4 × 6 portrait, a 4 × 6 landscape or a 2 × 1 label
  const cases: Array<['4x6' | '2x1', 'portrait' | 'landscape', string, boolean]> = [
    ['4x6', 'landscape', tall, true], // the first job decides which element a stale reference would point at
    ['4x6', 'portrait', tall, true],
    ['2x1', 'landscape', tall, true],
    ['4x6', 'portrait', 'Hello', false],
    ['4x6', 'landscape', tall, true],
    ['2x1', 'landscape', 'Hello', false],
    ['4x6', 'portrait', tall, true],
  ];

  for (const [profile, orientation, text, overflow] of cases) {
    const reported = await sendJob(page, makeJob(profile, orientation, text));
    const name = `${profile} ${orientation} ${text === 'Hello' ? 'short' : 'tall'} text`;
    expect(reported.overflow, `overflow for ${name}`).toBe(overflow);
    expect(reported.lineTextOffsets.length, `line count for ${name}`).toBe(text === 'Hello' ? 1 : 20);
  }
});

test('every report describes the label it answers, not the one shown just before', async ({ page }) => {
  // Alternate a one-line label and a 100-line label. A report taken before the page has
  // drawn the new label would show the previous label's line count instead.
  for (let round = 0; round < 20; round++) {
    const small = await sendJob(page, makeJob('2x1', 'landscape', 'Col1\tCol2'));
    expect(small.lineTextOffsets.length, `small label, round ${round}`).toBeLessThanOrEqual(2);
    expect(small.overflow, `small label overflow, round ${round}`).toBe(false);

    const big = await sendJob(page, makeJob('2x1', 'landscape', lines(100)));
    expect(big.lineTextOffsets.length, `big label, round ${round}`).toBe(100);
    expect(big.overflow, `big label overflow, round ${round}`).toBe(true);
  }
});

test('a shipping label reports the fixed image layout, and text and image jobs can alternate', async ({ page }) => {
  const png = await makeLabelPng(page);
  const imageLayout = { logicalWidthPt: 288, logicalHeightPt: 432, lineRectsPt: [], lineTextOffsets: [], overflow: false };

  for (let round = 0; round < 3; round++) {
    expect(await sendJob(page, makeImageJob(png))).toEqual(imageLayout);
    const text = await sendJob(page, makeJob('4x6', 'portrait', 'Hello'));
    expect(text.lineTextOffsets).toHaveLength(1);
  }

  // The label image fills exactly one portrait 4 × 6 page.
  const img = page.locator('img.shipping-label-image');
  await sendJob(page, makeImageJob(png));
  await expect(img).toHaveCount(1);
  const box = await img.boundingBox();
  expect([box!.width, box!.height]).toEqual([384, 576]);
  expect(await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([812, 1218]);
});
