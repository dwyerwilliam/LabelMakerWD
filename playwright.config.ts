import { defineConfig, devices } from '@playwright/test';
import os from 'os';
import path from 'path';

// `npm run dev` normally also opens an Electron window; the web server below turns that
// off. As a second safeguard it still gets a throwaway settings directory, so a test run
// can never read or change the real Label Maker settings (honored by unpackaged builds only).
// A fixed path (rather than a new directory per load) because Playwright loads this
// config in every worker process.
const isolatedUserData = path.join(os.tmpdir(), 'labelmaker-ui-userdata');

// Optional: run against an already installed Chromium instead of the build this
// Playwright version downloads, e.g. PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  fullyParallel: true,
  webServer: {
    command: 'npm run dev',
    port: 15174,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    // Only the renderer is needed for the browser tests, so no Electron window is opened.
    env: { LABELMAKER_NO_ELECTRON: '1', LABELMAKER_USER_DATA_DIR: isolatedUserData },
  },
  use: {
    baseURL: 'http://127.0.0.1:15174',
    trace: 'on-first-retry',
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
