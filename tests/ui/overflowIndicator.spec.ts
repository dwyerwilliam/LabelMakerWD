import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi';

// The red outline and the "clipped" answer come from measuring an off-screen copy of the
// label. That copy has to be measured correctly after the layout changes, whichever layout
// the app started in.

const TALL = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join('\n');

for (const start of ['portrait', 'landscape'] as const) {
  test(`overflow is flagged after switching layout, starting in ${start}`, async ({ page }) => {
    await installMockApi(page, { queues: ['4x6', '2x1'], savedOrientation: start });
    await page.goto('/');

    const editor = page.getByRole('textbox', { name: 'Label text editor' });
    await editor.click();
    await editor.fill(TALL);
    await expect(page.locator('.preview-mode .label-safe-area.has-overflow')).toBeVisible();

    // Short text clears it, in the other orientation too.
    const other = start === 'portrait' ? 'Landscape' : 'Portrait';
    await page.getByRole('button', { name: other, exact: true }).click();
    await expect(page.locator('.preview-mode .label-safe-area.has-overflow')).toBeVisible();

    await editor.fill('Hello');
    await expect(page.locator('.preview-mode .label-safe-area.has-overflow')).toHaveCount(0);

    await editor.fill(TALL);
    await expect(page.locator('.preview-mode .label-safe-area.has-overflow')).toBeVisible();

    // The 2 × 1 label is a third layout; it overflows with this text too.
    await page.getByRole('tab', { name: '2 × 1' }).click();
    await expect(page.locator('.preview-mode .label-safe-area.has-overflow')).toBeVisible();
    await editor.fill('Hello');
    await expect(page.locator('.preview-mode .label-safe-area.has-overflow')).toHaveCount(0);
  });
}
