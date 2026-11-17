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
