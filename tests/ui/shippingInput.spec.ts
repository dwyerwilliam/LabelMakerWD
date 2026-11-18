// How shipping labels get in, through the interface (mocked bridge; nothing is printed):
// the Text / Shipping label switch, Ctrl+V, drag and drop, the Paste button, warnings,
// darkness, errors and the close guard. Maps to SHIPPING_LABEL_FUNCTIONAL_SPEC.md §7.
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { configureMock, installMockApi, labelHasText, preferenceUpdates, type MockOptions } from './support/mockApi';

const fixtureBytes = (name: string) => [...fs.readFileSync(path.resolve('tests/fixtures/shipping', name))];

async function open(page: Page, options: MockOptions = {}): Promise<void> {
  await installMockApi(page, options);
  await page.goto('/');
}

const modeButton = (page: Page, name: 'Text' | 'Shipping label') =>
  page.getByRole('group', { name: '4 × 6 content' }).getByRole('button', { name, exact: true });

interface SnipOptions {
  width?: number;
  height?: number;
  /** CSS selector of the element the paste is dispatched on (default: body). */
  target?: string;
  /** Also put this plain text on the clipboard. */
  text?: string;
  /** Put only text on the clipboard, no image. */
  textOnly?: boolean;
}

/**
 * Pastes a "screen snip": a 20 px viewer-gray frame around a white page with a black block at
 * the top-left and one at the bottom-right of its content, like a label snipped from a PDF viewer.
 */
async function pasteSnip(page: Page, options: SnipOptions = {}): Promise<void> {
  await page.evaluate(async ({ width = 600, height = 900, target, text, textOnly }) => {
    const dt = new DataTransfer();
    if (text) dt.setData('text/plain', text);
    if (!textOnly) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#525659';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(20, 20, width - 40, height - 40);
      ctx.fillStyle = '#000000';
      ctx.fillRect(40, 40, width * 0.3, height * 0.1);
      ctx.fillRect(width * 0.6, height * 0.8, width * 0.3, height * 0.1);
      const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
      dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));
    }
    const el = (target ? document.querySelector(target) : null) ?? document.body;
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, options);
}

/** Drops files on the window, as a drag from Explorer or Finder would. */
async function dropFiles(page: Page, files: Array<{ name: string; type: string; bytes?: number[]; text?: string }>): Promise<void> {
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const content = f.bytes ? new Uint8Array(f.bytes) : (f.text ?? '');
      dt.items.add(new File([content], f.name, { type: f.type }));
    }
    const target = document.querySelector('main') ?? document.body;
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, files);
}

const pdf = (name: string) => ({ name, type: 'application/pdf', bytes: fixtureBytes(name) });

// ---------------------------------------------------------------------------
// S01: the mode switch
// ---------------------------------------------------------------------------

test('S01: the mode switch is on the 4 × 6 tab only, keeps the text and the label, and is saved', async ({ page }) => {
  await open(page);
  await expect(modeButton(page, 'Text')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('textbox', { name: 'Label text editor' }).click();
  await page.keyboard.type('Kept text');

  await modeButton(page, 'Shipping label').click();
  await expect(modeButton(page, 'Shipping label')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('shipping-dropzone')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Font family/ })).toHaveCount(0); // text controls are hidden
  expect((await preferenceUpdates(page)).at(-1)?.shippingLabel?.mode4x6).toBe('image');

  await pasteSnip(page);
  await expect(page.getByTestId('shipping-preview')).toBeVisible();

  // The 2 × 1 tab has no switch and always shows the text editor, with the same text.
  await page.getByRole('tab', { name: '2 × 1' }).click();
  await expect(page.getByRole('group', { name: '4 × 6 content' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Label text editor' })).toHaveText('Kept text');

  // Back on 4 × 6 the label is still there; Text mode still has the text.
  await page.getByRole('tab', { name: '4 × 6' }).click();
  await expect(page.getByTestId('shipping-preview')).toBeVisible();
  await modeButton(page, 'Text').click();
  await expect(page.getByRole('textbox', { name: 'Label text editor' })).toHaveText('Kept text');
});

test('S01: a saved Shipping label mode is restored at launch, without a label', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await expect(modeButton(page, 'Shipping label')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('shipping-dropzone')).toBeVisible();
});

// ---------------------------------------------------------------------------
// S02–S05: pasting snips
// ---------------------------------------------------------------------------

test('S02: a pasted snip goes straight to the preview, trimmed, with no dialog', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await pasteSnip(page, { width: 1200, height: 1800 });
  await expect(page.getByTestId('shipping-preview')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('shipping-caption')).toHaveText(/^From clipboard snip · about \d+ dpi$/);
  await expect(page.getByTestId('shipping-warning')).toHaveCount(0); // sharp enough, 4 × 6-shaped
});

test('S03: in Text mode, plain text pastes as text even when an image comes with it', async ({ page }) => {
  await open(page);
  await page.getByRole('textbox', { name: 'Label text editor' }).click();
  await pasteSnip(page, { target: '[aria-label="Label text editor"]', text: 'Pasted words' });
  await expect(page.getByRole('textbox', { name: 'Label text editor' })).toHaveText('Pasted words');
  await expect(modeButton(page, 'Text')).toHaveAttribute('aria-pressed', 'true');
});

test('S03: in Text mode, an image-only paste into the editor becomes a shipping label', async ({ page }) => {
  await open(page);
  await page.getByRole('textbox', { name: 'Label text editor' }).click();
  await pasteSnip(page, { target: '[aria-label="Label text editor"]' });
  await expect(modeButton(page, 'Shipping label')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('shipping-preview')).toBeVisible();
});

test('S04: a sideways snip is turned to portrait, and Rotate changes it', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await pasteSnip(page, { width: 1800, height: 1200 });
  const preview = page.getByTestId('shipping-preview');
  await expect(preview).toBeVisible();
  await expect(page.getByTestId('shipping-warning')).toHaveCount(0); // turned, so it is 4 × 6-shaped

  const before = await preview.getAttribute('src');
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await expect(preview).not.toHaveAttribute('src', before!);
  // Turned upright again, a landscape snip no longer looks like a 4 × 6 label.
  await expect(page.getByTestId('shipping-warning')).toContainText("This doesn't look like a 4 × 6 label.");
});

test('S05: a low-resolution snip is printable but warns about barcodes', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await pasteSnip(page, { width: 300, height: 450 });
  await expect(page.getByTestId('shipping-warning')).toContainText('Low-resolution snip');
  await expect(page.getByTestId('shipping-warning')).toContainText('Barcodes may not scan.');
  await expect(page.getByRole('button', { name: /^Print 4 × 6/ })).toBeEnabled();
});

test('pasting only text in Shipping label mode explains what to do', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await pasteSnip(page, { text: 'just words', textOnly: true });
  await expect(page.getByTestId('shipping-message')).toContainText('The clipboard has text, not an image. Switch to Text to paste text.');
});

// ---------------------------------------------------------------------------
// The Paste button
// ---------------------------------------------------------------------------

test('the Paste button loads the image on the system clipboard, or says there is none', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  const dropzone = page.getByTestId('shipping-dropzone');

  await dropzone.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByTestId('shipping-message')).toContainText('No image on the clipboard. Take a screen snip first');

  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 1200;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 800, 1200);
    ctx.fillStyle = '#000';
    ctx.fillRect(50, 50, 700, 200);
    const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await configureMock(page, Function('m', `m.clipboardImage = new Uint8Array(${JSON.stringify(png)});`) as never);
  await dropzone.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByTestId('shipping-preview')).toBeVisible();
  await expect(page.getByTestId('shipping-caption')).toHaveText(/^From clipboard snip/);
});

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

test('dropping a label PDF opens the crop dialog', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await dropFiles(page, [pdf('ebay-letter.pdf')]);
  await expect(page.getByRole('dialog', { name: 'Choose the label area' })).toBeVisible();
});

test('dropping a label on the 2 × 1 tab switches to 4 × 6 Shipping label and says why', async ({ page }) => {
  await open(page, { queues: ['4x6', '2x1'] });
  await page.getByRole('tab', { name: '2 × 1' }).click();
  await dropFiles(page, [pdf('label-4x6.pdf')]);
  await expect(page.getByTestId('shipping-preview')).toBeVisible();
  await expect(page.getByRole('tab', { name: '4 × 6' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Shipping labels print on the 4 × 6 printer.')).toBeVisible();
});

test('dropping several files uses the first supported one and says so', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await dropFiles(page, [{ name: 'notes.txt', type: 'text/plain', text: 'hello' }, pdf('label-4x6.pdf'), pdf('label-6x4.pdf')]);
  await expect(page.getByTestId('shipping-caption')).toHaveText('From label-4x6.pdf, page 1 · actual size');
  await expect(page.getByText('Only one file at a time. Using label-4x6.pdf.')).toBeVisible();
});

test('dropping a file that cannot be used, in Text mode, changes nothing and says why', async ({ page }) => {
  await open(page);
  await dropFiles(page, [{ name: 'notes.txt', type: 'text/plain', text: 'hello' }]);
  await expect(page.getByText("Label Maker can't open notes.txt. Use a PDF or an image (PNG, JPEG, GIF, BMP, WebP).")).toBeVisible();
  await expect(modeButton(page, 'Text')).toHaveAttribute('aria-pressed', 'true');
});

// ---------------------------------------------------------------------------
// S13, S17, S18: darkness, errors, close guard
// ---------------------------------------------------------------------------

test('S13: Darkness re-renders the label and is saved', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await dropFiles(page, [pdf('label-4x6.pdf')]);
  const preview = page.getByTestId('shipping-preview');
  await expect(preview).toBeVisible();
  const before = await preview.getAttribute('src');

  await page.getByLabel('Darkness').fill('5');
  await expect(preview).not.toHaveAttribute('src', before!);
  expect((await preferenceUpdates(page)).at(-1)?.shippingLabel?.darkness).toBe(5);
});

test('S17: a password-protected PDF is explained and the current label stays', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  await dropFiles(page, [pdf('label-4x6.pdf')]);
  await expect(page.getByTestId('shipping-caption')).toHaveText('From label-4x6.pdf, page 1 · actual size');

  await dropFiles(page, [pdf('encrypted.pdf')]);
  await expect(page.getByRole('alert')).toContainText(
    'encrypted.pdf is password-protected. Open it in a PDF viewer and take a screen snip instead.'
  );
  await expect(page.getByTestId('shipping-caption')).toHaveText('From label-4x6.pdf, page 1 · actual size');

  await dropFiles(page, [{ name: 'broken.pdf', type: 'application/pdf', text: 'not really a pdf' }]);
  await expect(page.getByRole('alert')).toContainText("broken.pdf isn't a readable PDF.");
  await expect(page.getByTestId('shipping-caption')).toHaveText('From label-4x6.pdf, page 1 · actual size');
});

test('S18: a loaded label with no text still makes closing ask first; Clear removes it', async ({ page }) => {
  await open(page, { shippingLabel: { mode4x6: 'image', darkness: 3, rememberedCrops: [] } });
  expect(await labelHasText(page)).toBe(false);
  await dropFiles(page, [pdf('label-4x6.pdf')]);
  await expect(page.getByTestId('shipping-preview')).toBeVisible();
  await expect.poll(() => labelHasText(page)).toBe(true);

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByTestId('shipping-dropzone')).toBeVisible();
  await expect.poll(() => labelHasText(page)).toBe(false);
});
