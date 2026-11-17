import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi';

// Spec A19: the editor must be reachable and leavable with the keyboard alone.

test('Tab and Shift+Tab move focus out of the editor instead of typing spaces', async ({ page }) => {
  await installMockApi(page, { queues: ['4x6'] });
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.click();
  await editor.fill('Hello');

  await page.keyboard.press('Tab');
  await expect(editor).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(editor).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(editor).not.toBeFocused();

  // Nothing was typed into the label by those key presses.
  await expect(editor).toHaveText('Hello');
});
