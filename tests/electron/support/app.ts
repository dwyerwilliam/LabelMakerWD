import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Helpers shared by the Electron specs. Every launch uses its own settings
 * directory (honored by unpackaged builds only), so tests never read or change
 * the real Label Maker settings and do not collide with a Label Maker that is
 * already open.
 */
export function makeUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'labelmaker-e2e-'));
}

export function removeUserDataDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

export async function launchApp(userDataDir: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [path.resolve('.')],
    env: { ...process.env, LABELMAKER_USER_DATA_DIR: userDataDir },
  });

  let main: Page | undefined;
  await expect
    .poll(
      () => {
        main = app.windows().find((page) => page.url().includes('index.html'));
        return Boolean(main);
      },
      { timeout: 20000 }
    )
    .toBe(true);

  return { app, window: main as Page };
}
