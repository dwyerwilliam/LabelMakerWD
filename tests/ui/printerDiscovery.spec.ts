import { test, expect } from '@playwright/test';
import { configureMock, installMockApi, mockCalls } from './support/mockApi';

test('on the first launch a machine with only an SP310 opens on the 2 × 1 profile', async ({ page }) => {
  await installMockApi(page, { queues: ['2x1'], firstLaunch: true });
  await page.goto('/');

  await expect(page.getByRole('tab', { name: '2 × 1' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('iDPRT SP310 — Ready')).toBeVisible();
  await expect(page.locator('text=Stock: DYMO 30334 · 2¼ × 1¼ in')).toBeVisible();
});

test('later launches keep the saved profile even if only an SP310 is connected', async ({ page }) => {
  await installMockApi(page, { queues: ['2x1'], firstLaunch: false });
  await page.goto('/');

  await expect(page.getByRole('tab', { name: '4 × 6' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('No SP410 selected')).toBeVisible();
});

test('the first launch stays on 4 × 6 when an SP410 is present', async ({ page }) => {
  await installMockApi(page, { queues: ['4x6', '2x1'], firstLaunch: true });
  await page.goto('/');

  await expect(page.getByRole('tab', { name: '4 × 6' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('iDPRT SP410BT — Ready')).toBeVisible();
});

test('returning to the window rescans quietly and finds a printer that was just connected', async ({ page }) => {
  await page.clock.install();
  await installMockApi(page, { queues: [] });
  await page.goto('/');
  await expect(page.getByText('No SP410 selected')).toBeVisible();
  expect((await mockCalls(page)).scan).toBe(1);

  // Just scanned: regaining focus right away does not scan again.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await mockCalls(page)).scan).toBe(1);

  // Later, with the printer now connected, regaining focus picks it up.
  await configureMock(page, (mock) => {
    mock.queues = ['4x6'];
  });
  await page.clock.fastForward(6000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(page.getByText('iDPRT SP410BT — Ready')).toBeVisible();
  expect((await mockCalls(page)).scan).toBe(2);
  // The status bar never showed "Scanning" for the background scan.
  await expect(page.getByText('Scanning for printers…')).toHaveCount(0);
});

test('a saved printer that is gone is kept and never replaced by another printer silently', async ({ page }) => {
  await installMockApi(page, { queues: ['4x6'], saved4x6: 'Old SP410' });
  await page.goto('/');

  await expect(page.getByText('Saved SP410 printer "Old SP410" not found')).toBeVisible();

  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.fill('Hello');
  // Another SP410 queue exists, but it is not used without the user choosing it.
  await expect(page.getByRole('button', { name: 'Print 4 × 6', exact: true })).toBeDisabled();

  await page.getByTitle('Printer & App Settings').click();
  await expect(page.getByRole('status').filter({ hasText: 'Your saved printer "Old SP410" is not installed right now' })).toBeVisible();

  await page.getByRole('button', { name: /iDPRT SP410BT Port: USB001/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('iDPRT SP410BT — Ready')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print 4 × 6', exact: true })).toBeEnabled();
});

test('paused and errored queues are named in the status bar', async ({ page }) => {
  await installMockApi(page, { queueStatus: 'paused' });
  await page.goto('/');
  await expect(page.getByText('iDPRT SP410BT — Paused')).toBeVisible();

  await configureMock(page, (mock) => {
    mock.status = 'error';
  });
  await page.getByRole('button', { name: 'Rescan' }).click();
  await expect(page.getByText('iDPRT SP410BT — Error')).toBeVisible();
});
