import { test, expect } from '@playwright/test';
import { installMockApi, prepareCalls } from './support/mockApi';

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
  await page.goto('/');

  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.click();
  await editor.fill('Hello');
  await expect(page.getByRole('button', { name: 'Print 4 × 6', exact: true })).toBeEnabled();
});

const printButton = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Print 4 × 6', exact: true });

test('an invalid font size is flagged, blocks Print and Ctrl+P, and Escape restores the last good value', async ({ page }) => {
  const size = page.locator('#fontSizeInput');

  for (const bad of ['5', '300', '24.3', 'abc', '']) {
    await size.fill(bad);
    await size.press('Tab');
    await expect(page.getByRole('alert').filter({ hasText: 'Font size must be 6–288 pt' })).toBeVisible();
    await expect(size).toHaveAttribute('aria-invalid', 'true');
    await expect(printButton(page)).toBeDisabled();
    // The entry is kept, not silently replaced.
    await expect(size).toHaveValue(bad);

    await page.keyboard.press('ControlOrMeta+p');
    expect(await prepareCalls(page)).toBe(0);
  }

  await size.focus();
  await size.press('Escape');
  await expect(size).toHaveValue('24');
  await expect(page.getByRole('alert').filter({ hasText: 'Font size' })).toHaveCount(0);
  await expect(printButton(page)).toBeEnabled();
});

test('valid font sizes in half-point steps are accepted exactly', async ({ page }) => {
  const size = page.locator('#fontSizeInput');

  for (const good of ['6', '12.5', '72', '288']) {
    await size.fill(good);
    await size.press('Tab');
    await expect(size).toHaveValue(good);
    await expect(size).toHaveAttribute('aria-invalid', 'false');
    await expect(printButton(page)).toBeEnabled();
  }
});

test('invalid copies are flagged and block Print and Ctrl+P', async ({ page }) => {
  const copies = page.locator('#copiesInput');

  for (const bad of ['0', '100', '2.5', 'abc', '']) {
    await copies.fill(bad);
    await copies.press('Tab');
    await expect(page.getByRole('alert').filter({ hasText: 'Copies must be a whole number from 1 to 99' })).toBeVisible();
    await expect(printButton(page)).toBeDisabled();

    await page.keyboard.press('ControlOrMeta+p');
    expect(await prepareCalls(page)).toBe(0);
  }

  await copies.fill('3');
  await copies.press('Tab');
  await expect(page.getByRole('alert').filter({ hasText: 'Copies' })).toHaveCount(0);
  await expect(printButton(page)).toBeEnabled();
});

test('Ctrl+P prints when every field is valid', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Label text editor' }).click();
  await page.keyboard.press('ControlOrMeta+p');
  await expect.poll(() => prepareCalls(page)).toBe(1);
});
