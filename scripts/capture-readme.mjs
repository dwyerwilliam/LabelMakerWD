// Capture the actual renderer with example printer queues for README images.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 15000);
  server.stdout.on('data', (data) => {
    if (data.toString().includes('http://127.0.0.1:4174/')) {
      clearTimeout(timeout);
      resolve();
    }
  });
  server.on('error', reject);
  server.on('exit', (code) => reject(new Error(`Preview server exited: ${code}`)));
});

const browser = await chromium.launch({
  ...(process.env.SCREENSHOT_BROWSER ? { executablePath: process.env.SCREENSHOT_BROWSER } : {}),
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await page.addInitScript(() => {
    const profiles = {
      '4x6': { orientation: 'portrait', fontFamily: 'Arial', fontSizePt: 28, alignment: 'center', printer: null },
      '2x1': { orientation: 'landscape', fontFamily: 'Arial', fontSizePt: 16, alignment: 'center', printer: null },
    };
    const preferences = { schemaVersion: 2, activeProfile: '4x6', profiles };
    const queue = (profile, name, port) => ({
      profile, displayName: name, deviceName: name, driver: name, model: name,
      port, isDefault: false, transport: 'usb', status: 'ready',
      requiresManualConfirmation: false, queryTimestamp: Date.now(),
    });
    window.api = {
      preferences: { get: async () => preferences, update: async () => {}, reset: async () => preferences },
      printers: { scan: async () => [queue('4x6', 'iDPRT SP410', 'USB001'), queue('2x1', 'iDPRT SP310', 'USB002')], select: async () => null },
      print: { onStateEvent: () => () => {} },
      app: { setLabelHasText: async () => {} },
    };
  });
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
  await page.getByRole('button', { name: 'Landscape', exact: true }).click();
  await page.getByRole('textbox', { name: 'Label text editor' }).fill('HANDLE WITH CARE\nThank you!');
  await page.getByRole('button', { name: 'Print 4 × 6' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  await fs.mkdir('docs/images', { recursive: true });
  await page.screenshot({ path: 'docs/images/label-4x6.png' });
  await page.getByRole('tab', { name: '2 × 1' }).click();
  await page.getByRole('textbox', { name: 'Label text editor' }).fill('Storage\nBox 01');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/images/label-2x1.png' });
} finally {
  await browser.close();
  server.kill();
}
