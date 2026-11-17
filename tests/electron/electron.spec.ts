import { test, expect, type ElectronApplication } from '@playwright/test';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { launchApp as launchAppIn, makeUserDataDir, removeUserDataDir } from './support/app';

// Every run uses its own settings directory (honored only by unpackaged
// builds), so tests never read or change the real Label Maker settings and do
// not collide with a Label Maker that is already open.
let userDataDir: string;

test.beforeEach(() => {
  userDataDir = makeUserDataDir();
});

test.afterEach(() => removeUserDataDir(userDataDir));

const launchApp = () => launchAppIn(userDataDir);

async function closeApp(app: ElectronApplication): Promise<void> {
  // A test that left text in the label would otherwise block on the real
  // "Discard label and close?" dialog until the test times out.
  await scriptCloseDialog(app, 1).catch(() => undefined);
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
    await window.evaluate(() => globalThis.window.api.preferences.get());

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
    await window.evaluate(() => globalThis.window.api.preferences.get());

    const closed = window.waitForEvent('close');
    await requestWindowClose(app);
    await closed;
  } finally {
    await closeApp(app);
  }
});

test('a blank line typed into the label prints with the same height the editor shows', async () => {
  const { app, window } = await launchApp();
  try {
    const editor = window.getByRole('textbox', { name: 'Label text editor' });
    await editor.click();
    await window.keyboard.type('a');
    await window.keyboard.press('Enter');
    await window.keyboard.press('Enter');
    await window.keyboard.type('b');

    // The editor's own text and the print-geometry copy of the same text are
    // laid out by the app's real Chromium; a blank line used to show once in the
    // editor but print twice.
    const metrics = await window.evaluate(() => {
      const boxes = [...document.querySelectorAll<HTMLElement>('.label-text-container')];
      const live = boxes.find((box) => box.isContentEditable)!;
      const printed = boxes.find((box) => !box.isContentEditable)!;
      return { liveHeight: live.offsetHeight, printedHeight: printed.offsetHeight, printedText: printed.textContent };
    });
    expect(metrics.printedText).toBe('a\n\nb');
    expect(metrics.printedHeight).toBe(metrics.liveHeight);
  } finally {
    await closeApp(app);
  }
});

test('a saved font that is not installed is replaced with a visible notice, using the real installed-font list', async () => {
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({
      schemaVersion: 2,
      activeProfile: '4x6',
      profiles: {
        '4x6': { orientation: 'portrait', fontFamily: 'No Such Font 12345', fontSizePt: 24, alignment: 'center', printer: null },
        '2x1': { orientation: 'landscape', fontFamily: 'Arial', fontSizePt: 12, alignment: 'center', printer: null },
      },
    })
  );

  const { app, window } = await launchApp();
  try {
    const notice = window.getByRole('status').filter({ hasText: 'is not installed on this computer' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('"No Such Font 12345"');

    // The preference is kept; only the label's font is replaced.
    await expect(window.getByTitle('Select Font Family')).toContainText('No Such Font 12345');

    // Chromium's Local Font Access returned the real list. The built-in fallback never offers more than 14 families.
    await window.getByTitle('Select Font Family').click();
    expect(await window.locator('button[style*="font-family"]').count()).toBeGreaterThan(14);
  } finally {
    await closeApp(app);
  }
});

test('damaged settings load defaults, keep a copy of the file, and tell the user', async () => {
  const settingsFile = path.join(userDataDir, 'settings.json');
  fs.writeFileSync(settingsFile, '{ this is not json', 'utf-8');

  const { app, window } = await launchApp();
  try {
    const notice = window.getByRole('status').filter({ hasText: 'could not be read' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('settings.json.corrupt.');

    // Defaults are in use and the damaged file was saved, not deleted.
    await expect(window.locator('text=Stock: 4 × 6 in')).toBeVisible();
    expect(fs.readdirSync(userDataDir).some((name) => name.startsWith('settings.json.corrupt.'))).toBe(true);

    await notice.getByRole('button', { name: 'Dismiss' }).click();
    await expect(notice).toHaveCount(0);
  } finally {
    await closeApp(app);
  }
});

test('the app window refuses to open other windows or navigate to foreign pages', async () => {
  const { app, window } = await launchApp();
  try {
    // The splash screen closes by itself; wait for it so it does not count as a change.
    await expect.poll(() => app.windows().some((page) => page.url().includes('splash'))).toBe(false);
    const windowsBefore = app.windows().length;

    // A real click on a link that wants a new window: without a guard Electron opens one.
    await window.evaluate(() => {
      const link = document.createElement('a');
      link.id = 'popup';
      link.href = 'http://127.0.0.1:1/';
      link.target = '_blank';
      link.textContent = 'popup';
      link.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;padding:8px';
      document.body.appendChild(link);
    });
    await window.locator('#popup').click();
    await window.waitForTimeout(800);
    expect(app.windows().length).toBe(windowsBefore);

    // Navigating the window itself to a foreign address is stopped too.
    await window.evaluate(() => {
      globalThis.window.location.href = 'http://127.0.0.1:1/';
    });
    await window.waitForTimeout(800);
    expect(window.url()).toBe('labelmaker://app/index.html');
    // (Read the page directly: after a blocked navigation Playwright's locators keep waiting for it to finish.)
    expect(await window.evaluate(() => document.body.innerText)).toMatch(/Stock:\s*4 × 6 in/);
  } finally {
    await closeApp(app);
  }
});

test('a second launch hands over to the running app instead of opening another window', async () => {
  const { app } = await launchApp();
  try {
    // Minimise the running window, so a hand-over has something to bring back.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes('index.html'))
        ?.minimize();
    });

    // Requiring the electron package from Node gives the path of its executable.
    const electronPath: string = createRequire(import.meta.url)('electron');
    const second = spawn(electronPath, [path.resolve('.')], {
      env: { ...process.env, LABELMAKER_USER_DATA_DIR: userDataDir },
      stdio: 'ignore',
    });
    const exitCode = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        second.kill();
        resolve(-1);
      }, 20000);
      second.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    // The second process quit on its own (it did not have to be killed).
    expect(exitCode).toBe(0);

    const state = await app.evaluate(({ BrowserWindow }) => {
      const mains = BrowserWindow.getAllWindows().filter((win) => win.webContents.getURL().includes('index.html'));
      return { count: mains.length, minimized: mains[0]?.isMinimized() };
    });
    expect(state.count).toBe(1);
    // ...and the running window was brought back.
    expect(state.minimized).toBe(false);
  } finally {
    await closeApp(app);
  }
});
