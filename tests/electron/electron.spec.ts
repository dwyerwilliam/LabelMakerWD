import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test('Electron app launches, displays main window and title', async () => {
  const electronApp = await electron.launch({
    args: [path.resolve('.')],
  });

  // Find the main index.html window
  const window = await electronApp.waitForEvent('window', {
    predicate: (page) => page.url().includes('index.html'),
  });

  expect(await window.title()).toBe('Label Maker');

  // Verify stock badge
  await expect(window.locator('text=Stock: 4 × 6 in')).toBeVisible();

  // Close app
  await electronApp.close();
});
