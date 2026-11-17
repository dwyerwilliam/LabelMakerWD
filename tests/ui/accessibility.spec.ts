import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi';

test.beforeEach(async ({ page }) => {
  await installMockApi(page, { queues: ['4x6', '2x1'] });
  await page.goto('/');
  await expect(page.getByText('iDPRT SP410BT — Ready')).toBeVisible();
});

test('every toolbar control has a name that says what it does', async ({ page }) => {
  const toolbar = page.locator('header');
  for (const name of [
    'Portrait',
    'Landscape',
    /^Font family: Arial$/,
    'Increase font size by 1 point',
    'Decrease font size by 1 point',
    'Align left',
    'Align center',
    'Align right',
    'Increase copies by 1',
    'Decrease copies by 1',
    'Printer and app settings',
  ]) {
    await expect(toolbar.getByRole('button', { name }), String(name)).toBeVisible();
  }
  await expect(toolbar.getByRole('textbox', { name: 'Size:' })).toBeVisible();
  await expect(toolbar.getByRole('textbox', { name: 'Copies:' })).toBeVisible();

  // No control is left with only an arrow or a single letter as its name.
  const names = await toolbar.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim())
  );
  for (const name of names) {
    expect(name, 'button name').not.toMatch(/^[▲▼LCR]$/);
    expect(name.length, 'button name').toBeGreaterThan(1);
  }
});

test('toggle buttons report which option is selected', async ({ page }) => {
  const portrait = page.getByRole('button', { name: 'Portrait' });
  const landscape = page.getByRole('button', { name: 'Landscape' });
  await expect(portrait).toHaveAttribute('aria-pressed', 'true');
  await expect(landscape).toHaveAttribute('aria-pressed', 'false');
  await landscape.click();
  await expect(landscape).toHaveAttribute('aria-pressed', 'true');
  await expect(portrait).toHaveAttribute('aria-pressed', 'false');

  const center = page.getByRole('button', { name: 'Align center' });
  const left = page.getByRole('button', { name: 'Align left' });
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await left.click();
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await expect(center).toHaveAttribute('aria-pressed', 'false');
});

test('the font picker says whether it is open', async ({ page }) => {
  const picker = page.getByRole('button', { name: /^Font family:/ });
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await picker.click();
  await expect(picker).toHaveAttribute('aria-expanded', 'true');
});

test('the profile tabs and the status bar are announced by name', async ({ page }) => {
  await expect(page.getByRole('tablist', { name: 'Label stock profile' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '4 × 6' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Label text editor' })).toHaveAttribute('aria-multiline', 'true');
});

test('Escape closes the font list and returns focus to its button', async ({ page }) => {
  const picker = page.getByRole('button', { name: /^Font family:/ });
  await picker.click();
  await expect(page.getByPlaceholder('Search installed fonts...')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('Search installed fonts...')).toHaveCount(0);
  await expect(picker).toBeFocused();
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
});
