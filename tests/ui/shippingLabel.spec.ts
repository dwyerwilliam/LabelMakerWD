// Shipping label mode through the interface, with the mocked bridge (nothing is printed).
// Phase 8 of SHIPPING_LABEL_TECHNICAL_SPEC.md extends this file to the full §14.3 list.
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { installMockApi, lastSnapshot } from './support/mockApi';

const fixture = (name: string) => path.resolve('tests/fixtures/shipping', name);

async function openInShippingMode(page: Page): Promise<void> {
  await installMockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Shipping label' }).click();
}

function pngSizeFromBase64(base64: string): [number, number] {
  const bytes = Buffer.from(base64, 'base64');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

const printButton = (page: Page) => page.getByRole('button', { name: /^Print 4 × 6/ });

test('Print is disabled until a shipping label is loaded, and says why', async ({ page }) => {
  await openInShippingMode(page);
  await expect(printButton(page)).toBeDisabled();
  await expect(printButton(page)).toHaveAttribute('title', 'Paste or drop a shipping label first');
  // The shortcut obeys the same rule.
  await page.keyboard.press('Control+p');
  expect(await lastSnapshot(page)).toBeNull();
});

test('a 4 × 6 label PDF prints as a shipping-label image job', async ({ page }) => {
  await openInShippingMode(page);
  await page.setInputFiles('[data-testid=shipping-file-input]', fixture('label-4x6.pdf'));
  await expect(page.getByTestId('shipping-preview')).toBeVisible();
  await expect(page.getByTestId('shipping-caption')).toHaveText('From label-4x6.pdf, page 1 · actual size');

  await expect(printButton(page)).toBeEnabled();
  await printButton(page).click();
  await expect(page.getByText('Sent to iDPRT SP410BT')).toBeVisible();

  const snapshot = (await lastSnapshot(page)) as Record<string, any>;
  expect(snapshot).toMatchObject({
    contentKind: 'image',
    text: '',
    profile: '4x6',
    orientation: 'portrait',
    copies: 1,
    expectedLayout: { logicalWidthPt: 288, logicalHeightPt: 432, lineTextOffsets: [], overflow: false },
    image: { widthPx: 812, heightPx: 1218 },
  });
  expect(pngSizeFromBase64(snapshot.image.pngBase64)).toEqual([812, 1218]);
});

test('a letter PDF is reviewed in the crop dialog, then printed with Ctrl+P', async ({ page }) => {
  await openInShippingMode(page);
  await page.setInputFiles('[data-testid=shipping-file-input]', fixture('ebay-letter.pdf'));
  const dialog = page.getByRole('dialog', { name: 'Choose the label area' });
  await expect(dialog).toBeVisible();
  await expect(printButton(page)).toBeDisabled(); // nothing to print until the area is accepted

  await page.keyboard.press('Enter'); // "Use this area" has focus
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('shipping-caption')).toHaveText('From ebay-letter.pdf, page 1 · actual size');

  await page.keyboard.press('Control+p');
  await expect(page.getByText('Sent to iDPRT SP410BT')).toBeVisible();
  expect(((await lastSnapshot(page)) as Record<string, any>).contentKind).toBe('image');
});

test('switching back to Text prints the text, not the shipping label', async ({ page }) => {
  await openInShippingMode(page);
  await page.setInputFiles('[data-testid=shipping-file-input]', fixture('label-4x6.pdf'));
  await expect(page.getByTestId('shipping-preview')).toBeVisible();

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Label text editor' }).click();
  await page.keyboard.type('Hello');
  await expect(printButton(page)).toBeEnabled();
  await printButton(page).click();
  await expect(page.getByText('Sent to iDPRT SP410BT')).toBeVisible();

  const snapshot = (await lastSnapshot(page)) as Record<string, any>;
  expect(snapshot.contentKind).toBe('text');
  expect(snapshot.text).toBe('Hello');
  expect(snapshot.image).toBeUndefined();
});
