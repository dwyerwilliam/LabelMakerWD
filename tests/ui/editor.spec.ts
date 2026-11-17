import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Inject mock window.api for browser UI test
  await page.addInitScript(() => {
    (window as any).api = {
      preferences: {
        get: async () => ({
          schemaVersion: 2,
          activeProfile: '4x6',
          profiles: {
            '4x6': { orientation: 'portrait', fontFamily: 'Arial', fontSizePt: 24, alignment: 'center', printer: null },
            '2x1': { orientation: 'landscape', fontFamily: 'Arial', fontSizePt: 12, alignment: 'center', printer: null },
          },
        }),
        update: async () => {},
        reset: async () => ({
          schemaVersion: 2,
          activeProfile: '4x6',
          profiles: {
            '4x6': { orientation: 'portrait', fontFamily: 'Arial', fontSizePt: 24, alignment: 'center', printer: null },
            '2x1': { orientation: 'landscape', fontFamily: 'Arial', fontSizePt: 12, alignment: 'center', printer: null },
          },
        }),
      },
      printers: {
        scan: async () => [
          {
            displayName: 'iDPRT SP410BT',
            deviceName: 'iDPRT SP410BT',
            isDefault: false,
            model: 'SP410BT',
            driver: 'iDPRT SP410BT',
            port: 'USB001',
            transport: 'usb',
            status: 'ready',
            paperDimensionsMm: { width: 101.6, height: 152.4 },
            hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
            resolutionDpi: { x: 203, y: 203 },
            profile: '4x6',
            requiresManualConfirmation: false,
            queryTimestamp: Date.now(),
          },
        ],
        select: async (_profile: string, _deviceName: string) => null,
      },
      print: {
        prepare: async (snapshot: any) => ({
          token: 'mock-token',
          readyToSubmit: true,
          requiresConfirmation: snapshot.expectedLayout?.overflow || false,
          confirmationReasons: snapshot.expectedLayout?.overflow ? ['overflow_clipped'] : [],
          snapshot,
        }),
        confirm: async () => ({ ok: true, value: undefined }),
        cancel: async () => {},
        status: async () => ({ requestId: '123', state: 'idle' }),
        onStateEvent: () => () => {},
      },
      app: {
        setLabelHasText: async () => {},
        getLaunchInfo: async () => ({ firstLaunch: false }),
      },
    };
  });

  await page.goto('/');
});

test('starts in portrait orientation with stock 4 x 6 badge and disabled print button', async ({ page }) => {
  await expect(page.locator('text=Stock: 4 × 6 in')).toBeVisible();
  const printButton = page.getByRole('button', { name: 'Print 4 × 6', exact: true });
  await expect(printButton).toBeDisabled();

  // Selected queue should show Ready status
  await expect(page.locator('text=iDPRT SP410BT — Ready')).toBeVisible();
});

test('typing text enables print button', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.click();
  await editor.fill('Shipping Label\nFragile Handle With Care');

  const printButton = page.getByRole('button', { name: 'Print 4 × 6', exact: true });
  await expect(printButton).toBeEnabled();
});

test('toggling orientation switches layout between portrait and landscape', async ({ page }) => {
  const landscapeBtn = page.getByRole('button', { name: 'Landscape' });
  await landscapeBtn.click();

  const landscapeSheet = page.locator('.preview-mode[data-orientation="landscape"]');
  await expect(landscapeSheet).toBeVisible();

  const portraitBtn = page.getByRole('button', { name: 'Portrait' });
  await portraitBtn.click();

  const portraitSheet = page.locator('.preview-mode[data-orientation="portrait"]');
  await expect(portraitSheet).toBeVisible();
});

test('switching to the 2 x 1 profile shows fixed landscape geometry', async ({ page }) => {
  await page.getByRole('tab', { name: '2 × 1' }).click();

  await expect(page.locator('text=Stock: DYMO 30334 · 2¼ × 1¼ in')).toBeVisible();
  await expect(page.getByText('Landscape', { exact: true })).toBeVisible();
  await expect(page.locator('.preview-mode[data-profile="2x1"][data-orientation="landscape"]')).toBeVisible();
  await expect(page.locator('text=No SP310 selected')).toBeVisible();
});

test('settings dialog opens and lists detected printer', async ({ page }) => {
  const settingsBtn = page.getByTitle('Printer & App Settings');
  await settingsBtn.click();

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('text=iDPRT SP410BT').first()).toBeVisible();
  await expect(page.locator('text=SP410 Match').first()).toBeVisible();

  // Close dialog
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).not.toBeVisible();
});

// --- Editor text model: what the editor shows must be what is printed -------------------------

/** Height of the live editor text and of the print-geometry copy of the same text. */
async function editorMetrics(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>('.label-text-container')];
    const live = boxes.find((box) => box.isContentEditable)!;
    const printed = boxes.find((box) => !box.isContentEditable)!;
    return {
      liveHeight: live.offsetHeight,
      printedHeight: printed.offsetHeight,
      printedText: printed.textContent ?? '',
      liveHtml: live.innerHTML,
    };
  });
}

const typingCases: Array<{ name: string; keys: string[]; text: string }> = [
  { name: 'two lines', keys: ['a', 'Enter', 'b'], text: 'a\nb' },
  { name: 'one blank line between lines', keys: ['a', 'Enter', 'Enter', 'b'], text: 'a\n\nb' },
  { name: 'two blank lines between lines', keys: ['a', 'Enter', 'Enter', 'Enter', 'b'], text: 'a\n\n\nb' },
  { name: 'blank first line', keys: ['Enter', 'a'], text: '\na' },
];

for (const { name, keys, text } of typingCases) {
  test(`typed ${name} print with the same height as the editor shows`, async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Label text editor' });
    await editor.click();
    for (const key of keys) {
      if (key.length === 1) await page.keyboard.type(key);
      else await page.keyboard.press(key);
    }

    const metrics = await editorMetrics(page);
    // A blank line used to show once in the editor but print twice.
    expect(metrics.printedText).toBe(text);
    expect(metrics.printedHeight).toBe(metrics.liveHeight);
  });
}

test('text filled with blank lines keeps exactly those lines', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.fill('Line A\n\nLine B\nLine C');

  const metrics = await editorMetrics(page);
  expect(metrics.printedText).toBe('Line A\n\nLine B\nLine C');
  expect(metrics.printedHeight).toBe(metrics.liveHeight);
});

test('pasting HTML-only content inserts plain text and runs nothing', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.click();
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.label-text-container')!;
    const data = new DataTransfer();
    data.setData('text/html', '<b>bold</b><br>second <i>line</i><img src="x" onerror="window.__ran = true">');
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });

  await expect(editor).toContainText('second line');
  const metrics = await editorMetrics(page);
  expect(metrics.printedText).toBe('bold\nsecond line');
  expect(metrics.liveHtml).not.toContain('<b>');
  expect(metrics.liveHtml).not.toContain('<img');
  expect(await page.evaluate(() => (window as unknown as { __ran?: boolean }).__ran)).toBeUndefined();
});

test('pasted tabs and Windows line endings become spaces and newlines', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.click();
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.label-text-container')!;
    const data = new DataTransfer();
    data.setData('text/plain', 'a\tb\r\nc');
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });

  await expect(editor).toContainText('c');
  const metrics = await editorMetrics(page);
  expect(metrics.printedText).toBe('a    b\nc');
  expect(metrics.printedHeight).toBe(metrics.liveHeight);
});

test('dropping rich text onto the label inserts only its plain text, with tabs expanded', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.click();

  // A draggable element that carries both an HTML and a plain-text payload, like text dragged from another app.
  await page.evaluate(() => {
    const source = document.createElement('div');
    source.id = 'drag-source';
    source.draggable = true;
    source.textContent = 'DRAG ME';
    source.style.cssText = 'position:fixed;left:20px;top:20px;padding:8px;background:#fde;z-index:99999';
    source.addEventListener('dragstart', (event) => {
      event.dataTransfer!.setData('text/html', '<b>BOLD</b>\tTAB');
      event.dataTransfer!.setData('text/plain', 'BOLD\tTAB');
      event.dataTransfer!.effectAllowed = 'copy';
    });
    document.body.appendChild(source);
  });

  const from = (await page.locator('#drag-source').boundingBox())!;
  const to = (await page.locator('.label-text-container').first().boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 10 });
  await page.mouse.up();

  await expect(editor).toContainText('TAB');
  const metrics = await editorMetrics(page);
  expect(metrics.liveHtml).not.toContain('<b>');
  expect(metrics.printedText).toBe('BOLD    TAB');
  expect(metrics.printedHeight).toBe(metrics.liveHeight);
});
