import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Every run uses its own settings directory (honored only by unpackaged
// builds), so tests never read or change the real Label Maker settings and do
// not collide with a Label Maker that is already open.
let userDataDir: string;

test.beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labelmaker-e2e-'));
});

test.afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
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

async function closeApp(app: ElectronApplication): Promise<void> {
  // The app may already have quit after its last window closed.
  await app.close().catch(() => undefined);
}

/** Replaces the native "Discard label and close?" prompt with a scripted answer (0 = keep editing, 1 = discard). */
async function scriptCloseDialog(app: ElectronApplication, answer: 0 | 1): Promise<void> {
  await app.evaluate(({ dialog }, response) => {
    const state = ((process as any).__closeDialog ??= { prompts: [], answer: 0, installed: false });
    state.answer = response;
    if (!state.installed) {
      state.installed = true;
      (dialog as any).showMessageBox = async (_win: unknown, options: { message: string; buttons: string[] }) => {
        state.prompts.push({ message: options.message, buttons: options.buttons });
        return { response: state.answer, checkboxChecked: false };
      };
    }
  }, answer);
}

async function promptCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => ((process as any).__closeDialog?.prompts.length as number | undefined) ?? 0);
}

async function requestWindowClose(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().includes('index.html'))
      ?.close();
  });
}

test('launches with isolated settings and the platform menu', async () => {
  const { app, window } = await launchApp();
  try {
    expect(await window.title()).toBe('Label Maker');

    // Isolation: the app is using the test directory, not the real one.
    const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
    expect(path.resolve(userData)).toBe(path.resolve(userDataDir));

    // Windows/Linux hide the menu bar; macOS needs an Edit menu for Cmd+C/V/X/A and Cmd+Q.
    const menuIsNull = await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null);
    expect(menuIsNull).toBe(process.platform !== 'darwin');

    await expect(window.locator('text=Stock: 4 × 6 in')).toBeVisible();
  } finally {
    await closeApp(app);
  }
});

test('saves formatting to the settings file and restores it on relaunch', async () => {
  const settingsFile = path.join(userDataDir, 'settings.json');

  const first = await launchApp();
  try {
    await first.window.getByTitle('Increase 1 pt').click();
    await expect(first.window.locator('#fontSizeInput')).toHaveValue('25');

    await expect
      .poll(() => (fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf-8')).profiles['4x6'].fontSizePt : null))
      .toBe(25);
  } finally {
    await closeApp(first.app);
  }

  const second = await launchApp();
  try {
    await expect(second.window.locator('#fontSizeInput')).toHaveValue('25');
  } finally {
    await closeApp(second.app);
  }
});

test('asks before closing a label that has text, and keeps it if the user cancels', async () => {
  const { app, window } = await launchApp();
  try {
    await scriptCloseDialog(app, 0);

    const editor = window.getByRole('textbox', { name: 'Label text editor' });
    await editor.click();
    await editor.fill('Hello');
    await expect(editor).toContainText('Hello');
    // IPC from one renderer is handled in order, so once this resolves main has
    // already received the "label has text" notice sent when the text changed.
    await window.evaluate(() => window.api.preferences.get());

    await requestWindowClose(app);
    await expect.poll(() => promptCount(app)).toBe(1);

    const prompt = await app.evaluate(() => (process as any).__closeDialog.prompts[0]);
    expect(prompt.buttons).toEqual(['Keep editing', 'Discard label and close']);

    // "Keep editing": the window stays open and the text is untouched.
    await window.waitForTimeout(500);
    expect(window.isClosed()).toBe(false);
    await expect(editor).toContainText('Hello');

    // "Discard label and close": the window closes.
    await scriptCloseDialog(app, 1);
    const closed = window.waitForEvent('close');
    await requestWindowClose(app);
    await closed;
  } finally {
    await closeApp(app);
  }
});

test('closes without asking when the label is empty', async () => {
  const { app, window } = await launchApp();
  try {
    await scriptCloseDialog(app, 0);
    await window.evaluate(() => window.api.preferences.get());

    const closed = window.waitForEvent('close');
    await requestWindowClose(app);
    await closed;
  } finally {
    await closeApp(app);
  }
});
