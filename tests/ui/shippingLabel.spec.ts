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

// ---------------------------------------------------------------------------
// The crop dialog (FS §4.6)
// ---------------------------------------------------------------------------

async function openPdf(page: Page, name: string): Promise<void> {
  await page.setInputFiles('[data-testid=shipping-file-input]', fixture(name));
  await expect(page.getByRole('dialog', { name: 'Choose the label area' })).toBeVisible();
  await expect(page.getByTestId('crop-box')).toBeVisible();
}

async function cropOf(page: Page): Promise<number[]> {
  return ((await page.getByTestId('crop-box').getAttribute('data-crop')) ?? '').split(',').map(Number);
}

function expectNear(actual: number[], expected: number[], tolerance = 0.03): void {
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]), `component ${i}: ${actual.join(',')}`).toBeLessThanOrEqual(tolerance));
}

const NOT_FOUND = "Couldn't find a 4 × 6 label on this page. Drag the box around the label.";

test('S06: an eBay-style page opens with the box around the label only, which prints at actual size', async ({ page }) => {
  await openInShippingMode(page);
  await openPdf(page, 'ebay-letter.pdf');
  expectNear(await cropOf(page), [0.054, 0.042, 0.48, 0.553]);
  await expect(page.getByTestId('crop-readout')).toContainText('prints at 98%');
  await expect(page.getByTestId('crop-thumbnail')).toBeVisible();
  await page.getByRole('button', { name: 'Use this area' }).click();
  await expect(page.getByTestId('shipping-caption')).toHaveText('From ebay-letter.pdf, page 1 · actual size');
});

test('S07: a sideways label above a fold line is boxed and turned to portrait', async ({ page }) => {
  await openInShippingMode(page);
  await openPdf(page, 'ups-letter.pdf');
  const [, y, , h] = await cropOf(page);
  expect(y + h).toBeLessThan(0.5); // the fold line is at half height
  await page.keyboard.press('Enter');
  const preview = page.getByTestId('shipping-preview');
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([812, 1218]);
});

test('S09: a label on page 2 is found, and the pages can be browsed', async ({ page }) => {
  await openInShippingMode(page);
  await openPdf(page, 'two-page.pdf');
  await expect(page.getByTestId('crop-page-number')).toHaveText('Page 2 of 2');
  await expect(page.getByTestId('crop-status')).toHaveText('Found a label on page 2.');
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();

  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByTestId('crop-page-number')).toHaveText('Page 1 of 2');
  await expect(page.getByTestId('crop-status')).toHaveText(NOT_FOUND);
});

test('S10: a page without a label says so', async ({ page }) => {
  await openInShippingMode(page);
  await openPdf(page, 'no-label.pdf');
  await expect(page.getByTestId('crop-status')).toHaveText(NOT_FOUND);
});

test('S11: the box can be resized, moved, drawn and reset, and never leaves the page', async ({ page }) => {
  await openInShippingMode(page);
  await openPdf(page, 'ebay-letter.pdf');
  const before = await cropOf(page);

  // Draw a new box from bottom-right to top-left (starting outside the current box).
  const pg = (await page.getByTestId('crop-page').boundingBox())!;
  await page.mouse.move(pg.x + pg.width * 0.9, pg.y + pg.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(pg.x + pg.width * 0.6, pg.y + pg.height * 0.7, { steps: 4 });
  await page.mouse.up();
  expectNear(await cropOf(page), [0.6, 0.7, 0.3, 0.2], 0.01);
  const drawn = await cropOf(page);

  // Drag the bottom-right handle far past the page corner: it stops at the edge.
  const handle = (await page.locator('[data-handle=se]').boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 2000, handle.y + 2000, { steps: 4 });
  await page.mouse.up();
  const grown = await cropOf(page);
  expect([grown[0], grown[1]]).toEqual([drawn[0], drawn[1]]);
  expect(grown[0] + grown[2]).toBeCloseTo(1, 2);
  expect(grown[1] + grown[3]).toBeCloseTo(1, 2);

  // Move the whole box up and left past the corner: it stops at (0, 0) and keeps its size.
  const box = (await page.getByTestId('crop-box').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 2000, box.y - 2000, { steps: 4 });
  await page.mouse.up();
  const moved = await cropOf(page);
  expect([moved[0], moved[1]]).toEqual([0, 0]);

  // Keyboard: Arrow moves by 1%, Shift+Arrow resizes by 1%.
  await page.getByRole('group', { name: 'Label area' }).focus();
  const k0 = await cropOf(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowLeft');
  const k1 = await cropOf(page);
  expect(k1[0]).toBeCloseTo(k0[0] + 0.01, 3);
  expect(k1[2]).toBeCloseTo(k0[2] - 0.01, 3);

  await page.getByRole('button', { name: 'Whole page' }).click();
  await expect.poll(() => cropOf(page)).toEqual([0, 0, 1, 1]);
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect.poll(async () => (await cropOf(page))[2]).toBeLessThan(0.6);
  expectNear(await cropOf(page), before);
});

test('S11: the rotation buttons change what will print', async ({ page }) => {
  await openInShippingMode(page);
  await openPdf(page, 'ebay-letter.pdf');
  await expect(page.getByTestId('crop-readout')).toContainText('prints at 98%');
  await page.getByRole('dialog').getByRole('button', { name: 'Rotate right' }).click();
  // A portrait label turned sideways has to shrink to fit the portrait stock.
  await expect(page.getByTestId('crop-readout')).toContainText('prints at 66%');
  await page.getByRole('dialog').getByRole('button', { name: 'Rotate left' }).click();
  await expect(page.getByTestId('crop-readout')).toContainText('prints at 98%');
});

test('Cancel and Escape keep the label that was there before', async ({ page }) => {
  await openInShippingMode(page);
  await page.setInputFiles('[data-testid=shipping-file-input]', fixture('label-4x6.pdf'));
  const caption = page.getByTestId('shipping-caption');
  await expect(caption).toHaveText('From label-4x6.pdf, page 1 · actual size');

  await openPdf(page, 'ebay-letter.pdf');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(caption).toHaveText('From label-4x6.pdf, page 1 · actual size');

  await openPdf(page, 'ebay-letter.pdf');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(caption).toHaveText('From label-4x6.pdf, page 1 · actual size');
});

test('Adjust crop reopens the dialog on the current label and applies the change', async ({ page }) => {
  await openInShippingMode(page);
  await openPdf(page, 'ebay-letter.pdf');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('shipping-preview')).toBeVisible();

  await page.getByRole('button', { name: 'Adjust crop…' }).click();
  await expect(page.getByTestId('crop-box')).toBeVisible();
  await page.getByRole('button', { name: 'Whole page' }).click();
  await expect.poll(() => cropOf(page)).toEqual([0, 0, 1, 1]);
  await page.getByRole('button', { name: 'Use this area' }).click();
  // The whole letter page fits 4 × 6 at about 47%.
  await expect(page.getByTestId('shipping-caption')).toHaveText('From ebay-letter.pdf, page 1 · prints at 47% of original size');
});

test('S12: the accepted area is offered next time, and Settings can forget it', async ({ page }) => {
  await openInShippingMode(page);
  await openPdf(page, 'ebay-letter.pdf');
  // Draw a distinctive box and accept it.
  const pg = (await page.getByTestId('crop-page').boundingBox())!;
  await page.mouse.move(pg.x + pg.width * 0.1, pg.y + pg.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(pg.x + pg.width * 0.7, pg.y + pg.height * 0.8, { steps: 4 });
  await page.mouse.up();
  const chosen = await cropOf(page);
  await page.getByRole('button', { name: 'Use this area' }).click();
  await expect(page.getByTestId('shipping-preview')).toBeVisible();

  await openPdf(page, 'ebay-letter.pdf');
  await expect(page.getByTestId('crop-status')).toHaveText('Using the area you chose last time for this page size.');
  expectNear(await cropOf(page), chosen, 0.002);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Printer and app settings' }).click();
  await page.getByRole('button', { name: 'Forget 1 remembered label area' }).click();
  await expect(page.getByRole('button', { name: 'Forget 0 remembered label areas' })).toBeDisabled();
  await page.getByRole('button', { name: 'Done' }).click();

  await openPdf(page, 'ebay-letter.pdf');
  await expect(page.getByTestId('crop-status')).toHaveCount(0); // detected again: no remembered area
});

// ---------------------------------------------------------------------------
// Accessibility of the new screens (spec §14.3, item 17)
// ---------------------------------------------------------------------------

async function axeViolations(page: Page): Promise<string[]> {
  await page.waitForTimeout(400); // colors animate briefly after changes
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.help}\n` + v.nodes.map((n) => `  ${n.target.join(' ')}: ${n.any[0]?.message ?? n.failureSummary}`).join('\n')
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: the shipping view and crop dialog have no accessibility violations`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openInShippingMode(page);
    expect(await axeViolations(page), 'empty view').toEqual([]);

    await openPdf(page, 'two-page.pdf');
    await expect(page.getByTestId('crop-thumbnail')).toBeVisible();
    expect(await axeViolations(page), 'crop dialog').toEqual([]);

    await page.getByRole('button', { name: 'Use this area' }).click();
    await expect(page.getByTestId('shipping-preview')).toBeVisible();
    expect(await axeViolations(page), 'loaded view').toEqual([]);
  });
}
