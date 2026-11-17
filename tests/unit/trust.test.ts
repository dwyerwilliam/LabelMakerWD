import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import { isAppUrl } from '@shared/appOrigin';
import { configureTrust, isTrustedSender, setTrustedWindows, validateIpcSender } from '@main/ipc/trustedSender';
import {
  cancelPrintPayloadSchema,
  printStatusPayloadSchema,
  printWindowReadyPayloadSchema,
  selectPrinterPayloadSchema,
} from '@shared/schemas';

describe('isAppUrl', () => {
  it('accepts pages served by the app', () => {
    expect(isAppUrl('labelmaker://app/index.html', false)).toBe(true);
    expect(isAppUrl('labelmaker://app/print.html?x=1#y', false)).toBe(true);
    expect(isAppUrl('labelmaker://app', false)).toBe(true);
  });

  it('rejects look-alikes that only share a prefix', () => {
    for (const url of [
      'labelmaker://app.evil.com/index.html',
      'labelmaker://appx/index.html',
      'labelmaker://app@evil.com/index.html',
      'labelmaker://user:pw@app/index.html',
      'labelmaker://app:8080/index.html',
      'labelmaker://other/index.html',
      'labelmakers://app/index.html',
    ]) {
      expect(isAppUrl(url, false), url).toBe(false);
    }
  });

  it('trusts the Vite dev origin only when asked to', () => {
    expect(isAppUrl('http://127.0.0.1:15174/', false)).toBe(false);
    expect(isAppUrl('http://localhost:15174/print.html', false)).toBe(false);
    expect(isAppUrl('http://127.0.0.1:15174/', true)).toBe(true);
    expect(isAppUrl('http://localhost:15174/print.html', true)).toBe(true);
    // Other ports and hosts that merely start with the dev origin are not it.
    expect(isAppUrl('http://127.0.0.1:151745/', true)).toBe(false);
    expect(isAppUrl('http://127.0.0.1:15174.evil.com/', true)).toBe(false);
    expect(isAppUrl('http://127.0.0.1:15175/', true)).toBe(false);
  });

  it('rejects everything else', () => {
    for (const url of ['https://example.com/', 'file:///C:/Windows/win.ini', 'data:text/html,hi', 'about:blank', 'not a url', '', undefined, null]) {
      expect(isAppUrl(url as string, true), String(url)).toBe(false);
    }
  });
});

describe('isTrustedSender', () => {
  const mainSender = { getURL: () => 'labelmaker://app/index.html' };
  const printSender = { getURL: () => 'labelmaker://app/print.html' };
  const win = (webContents: object) => ({ webContents }) as unknown as BrowserWindow;
  const event = (sender: object, frame: object | null = { parent: null, url: 'labelmaker://app/index.html' }) =>
    ({ sender, senderFrame: frame }) as never;

  beforeEach(() => {
    configureTrust({ allowDevOrigin: false });
    setTrustedWindows(win(mainSender), win(printSender));
  });

  it('accepts the expected window for each role', () => {
    expect(isTrustedSender(event(mainSender), 'main')).toBe(true);
    expect(isTrustedSender(event(printSender, { parent: null, url: 'labelmaker://app/print.html' }), 'print')).toBe(true);
  });

  it('keeps the two windows apart: the editor cannot pose as the print window or the reverse', () => {
    expect(isTrustedSender(event(printSender), 'main')).toBe(false);
    expect(isTrustedSender(event(mainSender), 'print')).toBe(false);
  });

  it('rejects a sub-frame, a foreign page, an unknown sender and a closed window', () => {
    expect(isTrustedSender(event(mainSender, { parent: {}, url: 'labelmaker://app/index.html' }))).toBe(false);
    expect(isTrustedSender(event(mainSender, { parent: null, url: 'https://example.com/' }))).toBe(false);
    expect(isTrustedSender(event({ getURL: () => 'labelmaker://app/index.html' }))).toBe(false);

    setTrustedWindows(null, null);
    expect(isTrustedSender(event(mainSender))).toBe(false);
  });

  it('falls back to the page URL when the frame is gone, and still checks it', () => {
    expect(isTrustedSender(event(mainSender, null))).toBe(true);
    const foreign = { getURL: () => 'https://example.com/' };
    setTrustedWindows(win(foreign), null);
    expect(isTrustedSender(event(foreign, null))).toBe(false);
  });

  it('does not trust the dev origin in a packaged build', () => {
    const dev = { getURL: () => 'http://127.0.0.1:15174/' };
    setTrustedWindows(win(dev), null);
    expect(isTrustedSender(event(dev, { parent: null, url: 'http://127.0.0.1:15174/' }))).toBe(false);
    configureTrust({ allowDevOrigin: true });
    expect(isTrustedSender(event(dev, { parent: null, url: 'http://127.0.0.1:15174/' }))).toBe(true);
  });

  it('validateIpcSender throws without leaking the URL', () => {
    expect(() => validateIpcSender(event(printSender) as never)).toThrow('Untrusted IPC sender');
    expect(() => validateIpcSender(event(mainSender) as never)).not.toThrow();
  });
});

describe('IPC payload schemas', () => {
  it('accepts a printer selection and rejects anything else', () => {
    expect(selectPrinterPayloadSchema.safeParse({ profile: '2x1', deviceName: 'iDPRT SP310', manualConfirm: true }).success).toBe(true);
    expect(selectPrinterPayloadSchema.safeParse({ profile: '2x1', deviceName: 'iDPRT SP310' }).success).toBe(true);
    for (const bad of [
      undefined,
      null,
      {},
      { profile: '3x5', deviceName: 'x' },
      { profile: '4x6', deviceName: '' },
      { profile: '4x6', deviceName: 42 },
      { profile: '4x6', deviceName: 'x', manualConfirm: 'yes' },
      { profile: '4x6', deviceName: 'x'.repeat(513) },
    ]) {
      expect(selectPrinterPayloadSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('validates cancel and status payloads', () => {
    expect(cancelPrintPayloadSchema.safeParse({ token: 'abc' }).success).toBe(true);
    expect(cancelPrintPayloadSchema.safeParse({ token: '' }).success).toBe(false);
    expect(cancelPrintPayloadSchema.safeParse(undefined).success).toBe(false);
    expect(printStatusPayloadSchema.safeParse({ requestId: randomUUID() }).success).toBe(true);
    expect(printStatusPayloadSchema.safeParse({ requestId: 'nope' }).success).toBe(false);
  });

  it('validates what the print window reports', () => {
    const fingerprint = { logicalWidthPt: 288, logicalHeightPt: 432, lineRectsPt: [], lineTextOffsets: [], overflow: false };
    expect(printWindowReadyPayloadSchema.safeParse({ requestId: randomUUID(), fingerprint }).success).toBe(true);
    expect(printWindowReadyPayloadSchema.safeParse({ requestId: randomUUID(), fingerprint: { overflow: 'no' } }).success).toBe(false);
    expect(printWindowReadyPayloadSchema.safeParse({ requestId: 'x', fingerprint }).success).toBe(false);
  });
});
