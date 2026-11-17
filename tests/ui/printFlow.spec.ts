import { test, expect, type Page } from '@playwright/test';
import { configureMock, installMockApi, mockCalls } from './support/mockApi';

async function openWithLabel(page: Page, options: Parameters<typeof installMockApi>[1] = {}) {
  await installMockApi(page, options);
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.click();
  await editor.fill('Hello');
  await expect(printButton(page)).toBeEnabled();
}

const printButton = (page: Page) => page.getByRole('button', { name: 'Print 4 × 6', exact: true });

test('a clipped label on a paused printer asks both questions, one after the other', async ({ page }) => {
  await openWithLabel(page, { queueStatus: 'paused' });
  await configureMock(page, (mock) => {
    mock.prepareReasons = ['overflow_clipped', 'printer_unavailable'];
  });

  await printButton(page).click();

  await expect(page.getByRole('heading', { name: 'Print Clipped Label?' })).toBeVisible();
  // Nothing is sent after the first answer alone.
  await page.getByRole('button', { name: 'Print Clipped Label' }).click();

  const second = page.getByRole('heading', { name: 'Printer Unavailable' });
  await expect(second).toBeVisible();
  // The profile and the reported state are named so a wrong-media choice can be caught.
  await expect(page.getByText(/4 × 6 \(SP410\) printer "iDPRT SP410BT" is reported paused/)).toBeVisible();
  expect((await mockCalls(page)).confirm).toBe(0);

  await page.getByRole('button', { name: 'Send to Queue' }).click();
  await expect.poll(async () => (await mockCalls(page)).confirm).toBe(1);
});

test('cancelling the second question submits nothing and discards the preparation', async ({ page }) => {
  await openWithLabel(page, { queueStatus: 'offline' });
  await configureMock(page, (mock) => {
    mock.prepareReasons = ['overflow_clipped', 'printer_unavailable'];
  });

  await printButton(page).click();
  await page.getByRole('button', { name: 'Print Clipped Label' }).click();
  await expect(page.getByRole('heading', { name: 'Printer Unavailable' })).toBeVisible();
  await expect(page.getByText(/reported offline/)).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Printer Unavailable' })).toHaveCount(0);

  const calls = await mockCalls(page);
  expect(calls.confirm).toBe(0);
  expect(calls.cancel).toBe(1);
});

test('a label that wraps differently on the page than in the preview asks first', async ({ page }) => {
  await openWithLabel(page);
  await configureMock(page, (mock) => {
    mock.prepareReasons = ['layout_differs'];
  });

  await printButton(page).click();
  await expect(page.getByRole('heading', { name: 'Label May Print Differently' })).toBeVisible();
  expect((await mockCalls(page)).confirm).toBe(0);

  // Cancel submits nothing.
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect((await mockCalls(page)).confirm).toBe(0);
  expect((await mockCalls(page)).cancel).toBe(1);

  // Choosing to print anyway sends the label.
  await printButton(page).click();
  await page.getByRole('button', { name: 'Print Anyway' }).click();
  await expect.poll(async () => (await mockCalls(page)).confirm).toBe(1);
});

test('an offline printer alone asks once and then sends', async ({ page }) => {
  await openWithLabel(page, { queueStatus: 'offline' });
  await configureMock(page, (mock) => {
    mock.prepareReasons = ['printer_unavailable'];
  });

  await printButton(page).click();
  await page.getByRole('button', { name: 'Send to Queue' }).click();

  await expect.poll(async () => (await mockCalls(page)).confirm).toBe(1);
  await expect(page.getByText('Sent to iDPRT SP410BT — 1 label(s).')).toBeVisible();
});

test('after an unconfirmed outcome the next print asks the user to check the queue first', async ({ page }) => {
  await openWithLabel(page);
  await configureMock(page, (mock) => {
    mock.confirmMode = 'uncertain';
  });

  await printButton(page).click();
  // The warning stays on screen; it is not a message that fades.
  await expect(page.getByText(/unconfirmed/).first()).toBeVisible();
  await expect.poll(async () => (await mockCalls(page)).confirm).toBe(1);

  await configureMock(page, (mock) => {
    mock.confirmMode = 'ok';
  });
  await printButton(page).click();
  await expect(page.getByRole('heading', { name: 'Check the Printer Queue First' })).toBeVisible();
  // Nothing was prepared again yet.
  expect((await mockCalls(page)).prepare).toBe(1);

  await page.getByRole('button', { name: 'Cancel' }).click();
  expect((await mockCalls(page)).prepare).toBe(1);

  // Choosing to print again goes ahead.
  await printButton(page).click();
  await page.getByRole('button', { name: 'Print Again' }).click();
  await expect.poll(async () => (await mockCalls(page)).confirm).toBe(2);
  await expect(page.getByText('Sent to iDPRT SP410BT — 1 label(s).')).toBeVisible();
});

test('an old status message timer never clears the status of a newer print', async ({ page }) => {
  await page.clock.install();
  await openWithLabel(page);

  // Print 1 succeeds and shows a message that would fade after 5 seconds.
  await printButton(page).click();
  await expect(page.getByText('Sent to iDPRT SP410BT — 1 label(s).')).toBeVisible();

  // Print 2 starts 3 seconds later and never finishes.
  await page.clock.fastForward(3000);
  await configureMock(page, (mock) => {
    mock.confirmMode = 'hang';
  });
  await printButton(page).click();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeVisible();

  // Print 1's timer fires now. It must not reset the busy state of print 2.
  await page.clock.fastForward(3000);
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
});
