import { test, expect } from '@playwright/test';
import { installMockApi, mockCalls } from './support/mockApi';
import { MAX_MEASURED_CHARACTERS } from '../../src/renderer/label/layout';

// A label cannot show more than a few thousand characters, so past a limit the app stops
// measuring every character (which made typing slow in a huge label) and only reports that the
// text overflows. Printing such a label must still work and must still ask about clipping.

const filler = (length: number) => 'Lorem ipsum dolor sit amet, consectetur. '.repeat(Math.ceil(length / 41)).slice(0, length);

test('a huge label still prints, overflows, and skips the per-character measurement', async ({ page }) => {
  await installMockApi(page, { queues: ['4x6'] });
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  const print = page.getByRole('button', { name: 'Print 4 × 6', exact: true });
  await editor.click();

  const snapshotAfter = async (text: string) => {
    const before = (await mockCalls(page)).prepare;
    await editor.fill(text);
    await expect(print).toBeEnabled();
    await print.click();
    await expect.poll(async () => (await mockCalls(page)).prepare).toBe(before + 1);
    return page.evaluate(
      () => (window as unknown as { __mock: { lastSnapshot: { expectedLayout: { overflow: boolean; lineTextOffsets: number[] } } } }).__mock.lastSnapshot.expectedLayout
    );
  };

  // Just under the limit every line is still measured.
  const measured = await snapshotAfter(filler(MAX_MEASURED_CHARACTERS - 100));
  expect(measured.lineTextOffsets.length).toBeGreaterThan(20);
  expect(measured.overflow).toBe(true);

  // Over the limit: one reading, still flagged as overflowing, and Print still works.
  const huge = await snapshotAfter(filler(MAX_MEASURED_CHARACTERS * 5));
  expect(huge.lineTextOffsets).toEqual([0]);
  expect(huge.overflow).toBe(true);
});
