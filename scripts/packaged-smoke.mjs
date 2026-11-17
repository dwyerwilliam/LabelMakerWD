// Starts the PACKAGED app (the one electron-builder produced, with its fuses and
// bundled resources) and checks the things that only break in a real package:
// the app protocol and assets, the preload bridge, the sandbox, installed-font
// access, and the bundled printer-inspection helper.
//
//   npm run package:win   (or package:mac)  ->  npm run test:packaged
//   PACKAGED_APP_PATH=/path/to/executable   to test a specific build
//
// The packaged build disables Node inspector flags (a fuse), so Playwright's
// Electron launcher cannot drive it. Chromium's own remote-debugging switch is
// not affected, so the renderer is driven over that instead. Nothing is printed.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function findPackagedExecutable() {
  if (process.env.PACKAGED_APP_PATH) return path.resolve(process.env.PACKAGED_APP_PATH);
  const out = path.resolve('releases/artifacts');
  const candidates = isWin
    ? [path.join(out, 'win-unpacked', 'Label Maker.exe')]
    : isMac
      ? [
          path.join(out, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Label Maker.app', 'Contents', 'MacOS', 'Label Maker'),
          path.join(out, 'mac-arm64', 'Label Maker.app', 'Contents', 'MacOS', 'Label Maker'),
          path.join(out, 'mac', 'Label Maker.app', 'Contents', 'MacOS', 'Label Maker'),
        ]
      : [];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function helperPath(executable) {
  return isWin
    ? path.join(path.dirname(executable), 'resources', 'native-bin', 'inspect_printer.exe')
    : path.join(path.dirname(executable), '..', 'Resources', 'native-bin', 'inspect_printer');
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
}

const executable = findPackagedExecutable();
if (!executable || !fs.existsSync(executable)) {
  console.error(
    'No packaged app found. Build one first (npm run package:win or npm run package:mac), or set PACKAGED_APP_PATH.\n' +
      `Looked in: ${path.resolve('releases/artifacts')}`
  );
  process.exit(1);
}
console.log(`Packaged app: ${executable}`);

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'labelmaker-packaged-'));
const port = await freePort();
const child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
  stdio: 'ignore',
  windowsHide: false,
});
let exited = false;
child.on('exit', () => {
  exited = true;
});

function stopApp() {
  if (exited) return;
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

let browser;
try {
  // Wait for the debugging endpoint to come up.
  const deadline = Date.now() + 45_000;
  let endpointUp = false;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        endpointUp = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check('packaged app starts', endpointUp, exited ? 'the process exited early' : 'no debugging endpoint after 45 s');
  if (!endpointUp) throw new Error('app did not start');

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];

  let page;
  const pageDeadline = Date.now() + 30_000;
  while (Date.now() < pageDeadline && !page) {
    page = context.pages().find((candidate) => candidate.url().startsWith('labelmaker://app/index.html'));
    if (!page) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  check('main window loads from labelmaker://app', Boolean(page), context.pages().map((p) => p.url()).join(', '));
  if (!page) throw new Error('main window not found');

  check('window title', (await page.title()) === 'Label Maker');
  check('editor renders (assets and scripts load through the app protocol)', await page.getByRole('textbox', { name: 'Label text editor' }).isVisible({ timeout: 15_000 }).catch(() => false));
  check('both profile tabs are shown', (await page.getByRole('tab').count()) === 2);

  const bridge = await page.evaluate(() => ({
    api: typeof window.api,
    groups: window.api ? Object.keys(window.api).sort() : [],
    nodeRequire: typeof window.require,
    nodeProcess: typeof window.process,
  }));
  check('preload bridge is exposed', bridge.api === 'object' && ['app', 'preferences', 'print', 'printers'].every((g) => bridge.groups.includes(g)), JSON.stringify(bridge));
  check('renderer is sandboxed (no Node globals)', bridge.nodeRequire === 'undefined' && bridge.nodeProcess === 'undefined', JSON.stringify(bridge));

  const fonts = await page.evaluate(async () => {
    try {
      const list = await window.queryLocalFonts();
      return { count: new Set(list.map((font) => font.family)).size };
    } catch (error) {
      return { error: String(error) };
    }
  });
  check('installed fonts can be read (Local Font Access works in the package)', typeof fonts.count === 'number' && fonts.count > 5, JSON.stringify(fonts));

  const scan = await page.evaluate(async () => {
    try {
      const queues = await window.api.printers.scan();
      return { ok: Array.isArray(queues), count: queues.length };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
  check('printer scan works through the bundled helper path', scan.ok === true, JSON.stringify(scan));

  const launch = await page.evaluate(() => window.api.app.getLaunchInfo());
  check('settings start fresh in the isolated profile', launch.firstLaunch === true && !launch.settingsProblem, JSON.stringify(launch));

  const helper = helperPath(executable);
  check('printer-inspection helper is bundled', fs.existsSync(helper), helper);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (failures.length === 0) failures.push('unexpected error');
} finally {
  await browser?.close().catch(() => {});
  stopApp();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nPackaged smoke test passed.');
