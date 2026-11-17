import { test, expect } from '@playwright/test';

// A correctly named SP310 queue whose connection type could not be read, an
// unsupported network SP410 queue, and a normal USB SP410: the three cases the
// Settings dialog has to handle.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const preferences = {
      schemaVersion: 2,
      activeProfile: '4x6',
      profiles: {
        '4x6': { orientation: 'portrait', fontFamily: 'Arial', fontSizePt: 24, alignment: 'center', printer: null },
        '2x1': { orientation: 'landscape', fontFamily: 'Arial', fontSizePt: 12, alignment: 'center', printer: null },
      },
    };
    const queue = (overrides: Record<string, unknown>) => ({
      displayName: 'queue',
      deviceName: 'queue',
      isDefault: false,
      model: '',
      driver: 'driver',
      port: 'USB001',
      transport: 'usb',
      status: 'ready',
      requiresManualConfirmation: false,
      queryTimestamp: 0,
      ...overrides,
    });
    const queues = [
      queue({ displayName: 'iDPRT SP410BT', deviceName: 'iDPRT SP410BT', profile: '4x6' }),
      queue({
        displayName: 'iDPRT SP310',
        deviceName: 'iDPRT SP310',
        profile: '2x1',
        port: 'COM5',
        transport: 'unknown',
        requiresManualConfirmation: true,
      }),
      queue({
        displayName: 'SP410 Network',
        deviceName: 'SP410 Network',
        profile: '4x6',
        port: 'IP_10.0.0.9',
        transport: 'network',
        requiresManualConfirmation: true,
      }),
    ];

    const w = window as any;
    w.__selectCalls = [];
    w.__failNextSelect = null as string | null;
    w.api = {
      preferences: { get: async () => preferences, update: async () => {}, reset: async () => preferences },
      printers: {
        scan: async () => queues,
        select: async (profile: string, deviceName: string, manualConfirm: boolean) => {
          w.__selectCalls.push({ profile, deviceName, manualConfirm });
          if (w.__failNextSelect) {
            const message = w.__failNextSelect;
            w.__failNextSelect = null;
            throw new Error(`Error invoking remote method 'printers:select': Error: ${message}`);
          }
          const found = queues.find((candidate) => candidate.deviceName === deviceName)!;
          return { ...found, profile, requiresManualConfirmation: false };
        },
      },
      print: {
        prepare: async (snapshot: unknown) => ({ token: 't', readyToSubmit: true, requiresConfirmation: false, confirmationReasons: [], snapshot }),
        confirm: async () => ({ ok: true, value: undefined }),
        cancel: async () => {},
        status: async () => ({ requestId: '1', state: 'idle' }),
        onStateEvent: () => () => {},
      },
      app: { setLabelHasText: async () => {}, getLaunchInfo: async () => ({ firstLaunch: false }) },
    };
  });

  await page.goto('/');
});

test('a queue with an unreadable connection type needs a USB confirmation before it can be used', async ({ page }) => {
  await page.getByRole('tab', { name: '2 × 1' }).click();
  await expect(page.getByText('No SP310 selected')).toBeVisible();

  const editor = page.getByRole('textbox', { name: 'Label text editor' });
  await editor.fill('Box 01');
  await expect(page.getByRole('button', { name: 'Print 2 × 1', exact: true })).toBeDisabled();

  await page.getByTitle('Printer & App Settings').click();
  await page.getByRole('button', { name: /iDPRT SP310 Port: COM5/ }).click();
  await expect(page.getByText('Connection type unknown. Select to confirm it is USB.')).toBeVisible();

  // Selecting alone must not send anything to main.
  expect(await page.evaluate(() => (window as any).__selectCalls)).toEqual([]);

  const useQueue = page.getByRole('button', { name: 'Use this queue' });
  await expect(useQueue).toBeDisabled();
  await page.getByLabel('This printer is connected via USB').check();
  await useQueue.click();

  await expect.poll(() => page.evaluate(() => (window as any).__selectCalls)).toEqual([
    { profile: '2x1', deviceName: 'iDPRT SP310', manualConfirm: true },
  ]);
  await expect(useQueue).toHaveCount(0);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('iDPRT SP310 — Ready')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print 2 × 1', exact: true })).toBeEnabled();
});

test('network and Bluetooth queues are shown as unsupported and cannot be selected', async ({ page }) => {
  await page.getByTitle('Printer & App Settings').click();

  const networkQueue = page.getByRole('button', { name: /SP410 Network Port: IP_/ });
  await expect(networkQueue).toBeDisabled();
  await expect(page.getByText('Bluetooth and network queues are not supported.')).toBeVisible();
});

test('a rejected selection shows the reason instead of failing silently', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).__failNextSelect = 'This printer is already assigned to another label profile.';
  });

  await page.getByTitle('Printer & App Settings').click();
  await page.getByRole('button', { name: /iDPRT SP410BT Port: USB001/ }).click();

  await expect(page.getByRole('alert')).toHaveText('This printer is already assigned to another label profile.');
});
