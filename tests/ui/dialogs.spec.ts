import { test, expect, type Page } from '@playwright/test';
import { configureMock, installMockApi, mockCalls } from './support/mockApi';

const printButton = (page: Page) => page.getByRole('button', { name: 'Print 4 × 6', exact: true });

async function withLabel(page: Page, options: Parameters<typeof installMockApi>[1] = {}) {
  await installMockApi(page, options);
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.click();
  await editor.fill('Hello');
  await expect(printButton(page)).toBeEnabled();
}

test('Settings is a named modal dialog: Escape closes it and focus returns to the button that opened it', async ({ page }) => {
  await withLabel(page);
  const opener = page.getByRole('button', { name: 'Printer and app settings' });
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  // Focus moved into the dialog.
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('Tab and Shift+Tab stay inside an open dialog', async ({ page }) => {
  await withLabel(page);
  await page.getByRole('button', { name: 'Printer and app settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();

  const insideDialog = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await insideDialog()).toBe(true);
  }
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await insideDialog()).toBe(true);
  }
});

test('a confirmation dialog starts on Cancel, cancels with Escape, and ignores Ctrl+P', async ({ page }) => {
  await withLabel(page, { queueStatus: 'offline' });
  await configureMock(page, (mock) => {
    mock.prepareReasons = ['printer_unavailable'];
  });

  await printButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Printer Unavailable' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/reported offline/);
  // A stray Enter must not send the label.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  // Printing again while the question is open does not prepare a second label behind it.
  await page.keyboard.press('ControlOrMeta+p');
  expect((await mockCalls(page)).prepare).toBe(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const calls = await mockCalls(page);
  expect(calls.confirm).toBe(0);
  expect(calls.cancel).toBe(1);
});
