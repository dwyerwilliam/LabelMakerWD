import type { Page } from '@playwright/test';

export interface MockOptions {
  /** Status the fake queues report. */
  queueStatus?: 'ready' | 'offline' | 'paused' | 'error' | 'unknown';
  /** Which fake USB queues exist at start: the SP410 (4x6) and/or the SP310 (2x1). Default: just the SP410. */
  queues?: Array<'4x6' | '2x1'>;
  /** Whether this launch started without a settings file. */
  firstLaunch?: boolean;
  /** A printer the user saved earlier for the 4 × 6 profile. */
  saved4x6?: string;
  /** The orientation saved for the 4 × 6 profile (default portrait). */
  savedOrientation?: 'portrait' | 'landscape';
  /** The font family saved for the 4 × 6 profile (default Arial). */
  savedFont?: string;
  /** Font families the fake system reports as installed. Omit to leave `queryLocalFonts` undefined (the app then checks common fonts itself). */
  installedFonts?: string[];
  /** Saved shipping-label preferences (default: Text mode, darkness 3, no remembered crops). */
  shippingLabel?: {
    mode4x6: 'text' | 'image';
    darkness: 1 | 2 | 3 | 4 | 5;
    rememberedCrops: Array<{ pageWidthPt: number; pageHeightPt: number; rect: { x: number; y: number; width: number; height: number }; rotation: 0 | 90 | 180 | 270 }>;
  };
}

/**
 * Installs a fake `window.api` (the preload bridge) with USB SP410 / SP310
 * queues. Tests steer behavior through `window.__mock`; nothing is ever sent to
 * a printer.
 */
export async function installMockApi(page: Page, options: MockOptions = {}): Promise<void> {
  await page.addInitScript((opts) => {
    const profiles = {
      '4x6': {
        orientation: opts.savedOrientation ?? 'portrait',
        fontFamily: opts.savedFont ?? 'Arial',
        fontSizePt: 24,
        alignment: 'center',
        printer: opts.saved4x6
          ? { deviceName: opts.saved4x6, platform: 'win32', identityFingerprint: '::', manualProfileConfirmed: false, usbConfirmed: true }
          : null,
      },
      '2x1': { orientation: 'landscape', fontFamily: 'Arial', fontSizePt: 12, alignment: 'center', printer: null },
    };
    const preferences = {
      schemaVersion: 2,
      activeProfile: '4x6',
      profiles,
      shippingLabel: opts.shippingLabel ?? { mode4x6: 'text', darkness: 3, rememberedCrops: [] },
    };

    const makeQueue = (profile: '4x6' | '2x1', status: string) => {
      const name = profile === '4x6' ? 'iDPRT SP410BT' : 'iDPRT SP310';
      return {
        displayName: name,
        deviceName: name,
        isDefault: false,
        model: '',
        driver: name,
        port: profile === '4x6' ? 'USB001' : 'USB002',
        transport: 'usb',
        status,
        profile,
        requiresManualConfirmation: false,
        queryTimestamp: 0,
      };
    };

    if (opts.installedFonts) {
      (window as unknown as Record<string, unknown>).__installedFonts = [...opts.installedFonts];
      (window as unknown as Record<string, unknown>).queryLocalFonts = async () =>
        ((window as unknown as Record<string, string[]>).__installedFonts).map((family) => ({
          family,
          fullName: family + ' Regular',
          postscriptName: family.replace(/ /g, ''),
          style: 'Regular',
        }));
    }

    type Listener = (event: { requestId: string; state: string; detail?: string }) => void;
    const listeners: Listener[] = [];
    const mock = {
      /** Which fake queues the next scan reports. */
      queues: (opts.queues ?? ['4x6']) as Array<'4x6' | '2x1'>,
      status: opts.queueStatus ?? 'ready',
      /** What the next prepare asks the user to confirm. */
      prepareReasons: [] as string[],
      /** How confirm behaves: succeed, report an unconfirmed outcome, or never answer. */
      confirmMode: 'ok' as 'ok' | 'uncertain' | 'hang',
      calls: { prepare: 0, confirm: 0, cancel: 0, scan: 0 },
      /** The snapshot the app last asked to print. */
      lastSnapshot: null as null | Record<string, unknown>,
      emit: (event: { requestId: string; state: string; detail?: string }) => listeners.forEach((l) => l(event)),
    };

    const w = window as unknown as Record<string, unknown>;
    w.__mock = mock;
    w.api = {
      preferences: { get: async () => preferences, update: async () => {}, reset: async () => preferences },
      printers: {
        scan: async () => {
          mock.calls.scan += 1;
          return mock.queues.map((profile) => makeQueue(profile, mock.status));
        },
        select: async (profile: '4x6' | '2x1', deviceName: string) => {
          const found = mock.queues.map((p) => makeQueue(p, mock.status)).find((q) => q.deviceName === deviceName);
          return found ? { ...found, profile } : null;
        },
      },
      print: {
        prepare: async (snapshot: { requestId: string }) => {
          mock.calls.prepare += 1;
          mock.lastSnapshot = snapshot as unknown as Record<string, unknown>;
          const reasons = mock.prepareReasons;
          return {
            token: `token-${mock.calls.prepare}`,
            readyToSubmit: reasons.length === 0,
            requiresConfirmation: reasons.length > 0,
            confirmationReasons: reasons,
            snapshot,
          };
        },
        confirm: async (_token: string, requestId: string) => {
          mock.calls.confirm += 1;
          mock.emit({ requestId, state: 'submitting', detail: 'Sending to iDPRT SP410BT…' });
          if (mock.confirmMode === 'hang') return new Promise(() => {});
          if (mock.confirmMode === 'uncertain') {
            const detail = 'The outcome for iDPRT SP410BT is unconfirmed. Check the printer queue before printing again, or a duplicate label may print.';
            mock.emit({ requestId, state: 'uncertain', detail });
            return { ok: false, error: { code: 'PRINT_OUTCOME_UNCERTAIN', message: detail } };
          }
          mock.emit({ requestId, state: 'submitted', detail: 'Sent to iDPRT SP410BT — 1 label(s).' });
          return { ok: true, value: undefined };
        },
        cancel: async () => {
          mock.calls.cancel += 1;
        },
        status: async () => ({ requestId: '1', state: 'idle' }),
        onStateEvent: (listener: Listener) => {
          listeners.push(listener);
          return () => {
            listeners.splice(listeners.indexOf(listener), 1);
          };
        },
      },
      app: {
        setLabelHasText: async () => {},
        getLaunchInfo: async () => ({ firstLaunch: opts.firstLaunch === true }),
      },
    };
  }, options);
}

export interface MockCalls {
  prepare: number;
  confirm: number;
  cancel: number;
  scan: number;
}

export async function mockCalls(page: Page): Promise<MockCalls> {
  return page.evaluate(() => (window as unknown as { __mock: { calls: MockCalls } }).__mock.calls);
}

export async function prepareCalls(page: Page): Promise<number> {
  return (await mockCalls(page)).prepare;
}

interface MockControls {
  queues: Array<'4x6' | '2x1'>;
  status: string;
  prepareReasons: string[];
  confirmMode: 'ok' | 'uncertain' | 'hang';
}

/** Runs a function against the mock in the page, e.g. to change how the next print or scan behaves. */
export async function configureMock(page: Page, fn: (mock: MockControls) => void): Promise<void> {
  await page.evaluate(`(${fn.toString()})(window.__mock)`);
}

/** The label snapshot the app last sent to be printed. */
export async function lastSnapshot(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => (window as unknown as { __mock: { lastSnapshot: Record<string, unknown> | null } }).__mock.lastSnapshot);
}
