import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import type { LayoutFingerprint, NormalizedQueue, PrintSnapshot } from '@shared/contracts';
import { IPC_CHANNELS } from '@shared/channels';
import { PrintService } from '@main/services/printService';
import type { PrinterService } from '@main/services/printerService';

type PrintCallback = (success: boolean, failureReason: string) => void;

function snapshotFor(overrides: Partial<PrintSnapshot> = {}): PrintSnapshot {
  return {
    requestId: randomUUID(),
    draftRevision: 1,
    text: 'Hello',
    profile: '4x6',
    orientation: 'portrait',
    resolvedFontFamily: 'Arial',
    fontSizePt: 24,
    alignment: 'center',
    copies: 1,
    expectedLayout: {
      logicalWidthPt: 288,
      logicalHeightPt: 432,
      lineRectsPt: [{ x: 0, y: 0, width: 10, height: 10 }],
      lineTextOffsets: [0],
      overflow: false,
    },
    ...overrides,
  };
}

function setup(
  options: { queue?: Partial<NormalizedQueue>; measured?: Partial<LayoutFingerprint>; listening?: boolean } = {}
) {
  const queue = {
    deviceName: 'iDPRT SP410BT',
    displayName: 'iDPRT SP410BT',
    profile: '4x6',
    status: 'ready',
    ...options.queue,
  } as NormalizedQueue;
  const printerService = {
    getSelectedQueue: vi.fn((profile: string) => (profile === queue.profile ? queue : null)),
  } as unknown as PrinterService;

  const stateEvents: Array<{ requestId: string; state: string; detail?: string }> = [];
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send: vi.fn((channel: string, payload: { requestId: string; state: string; detail?: string }) => {
        if (channel === IPC_CHANNELS.PRINT_STATE_EVENT) stateEvents.push(payload);
      }),
    },
  } as unknown as BrowserWindow;

  const service = new PrintService(printerService);
  const windowHandlers: Record<string, () => void> = {};
  const printCalls: Array<{ options: Record<string, any>; callback: PrintCallback }> = [];
  const printWindow = {
    isDestroyed: () => false,
    webContents: {
      on: vi.fn((event: string, handler: () => void) => {
        windowHandlers[event] = handler;
      }),
      // The hidden print window answers each job with the layout it measured.
      send: vi.fn((channel: string, snapshot: PrintSnapshot) => {
        if (channel !== IPC_CHANNELS.PRINT_WINDOW_JOB) return;
        queueMicrotask(() => {
          service.handlePrintWindowReady(snapshot.requestId, { ...snapshot.expectedLayout, ...options.measured });
        });
      }),
      print: vi.fn((printOptions: Record<string, any>, callback: PrintCallback) => {
        printCalls.push({ options: printOptions, callback });
      }),
    },
  } as unknown as BrowserWindow;

  service.setWindows(mainWindow, printWindow);
  // The print page normally announces itself once it has loaded.
  if (options.listening !== false) service.handlePrintWindowListening();
  return { service, queue, stateEvents, printCalls, printWindow, printerService, windowHandlers };
}

describe('PrintService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('prepare', () => {
    it('returns a token ready to submit for a healthy queue', async () => {
      const { service } = setup();
      const result = await service.prepare(snapshotFor());
      expect(result.token).toBeTruthy();
      expect(result.readyToSubmit).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.confirmationReasons).toEqual([]);
    });

    it('asks for confirmation when the text overflows', async () => {
      const { service } = setup({ measured: { overflow: true } });
      const result = await service.prepare(snapshotFor({ expectedLayout: { ...snapshotFor().expectedLayout, overflow: true } }));
      expect(result.confirmationReasons).toEqual(['overflow_clipped']);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.readyToSubmit).toBe(false);
    });

    it.each(['offline', 'paused', 'error'] as const)('asks for confirmation when the queue is %s', async (status) => {
      const { service } = setup({ queue: { status } });
      const result = await service.prepare(snapshotFor());
      expect(result.confirmationReasons).toEqual(['printer_unavailable']);
    });

    it('does not ask when the queue status is unknown or ready', async () => {
      for (const status of ['unknown', 'ready'] as const) {
        const { service } = setup({ queue: { status } });
        expect((await service.prepare(snapshotFor())).confirmationReasons).toEqual([]);
      }
    });

    it('lists every confirmation that applies, overflow first', async () => {
      const { service } = setup({ queue: { status: 'paused' }, measured: { overflow: true } });
      const result = await service.prepare(snapshotFor({ expectedLayout: { ...snapshotFor().expectedLayout, overflow: true } }));
      expect(result.confirmationReasons).toEqual(['overflow_clipped', 'printer_unavailable']);
    });

    describe('when the print window lays the text out differently from the preview', () => {
      const twoLines = {
        lineTextOffsets: [0, 3],
        lineRectsPt: [
          { x: 0, y: 0, width: 10, height: 10 },
          { x: 0, y: 10, width: 10, height: 10 },
        ],
      };

      it('asks the user when the text wraps differently', async () => {
        const { service } = setup({ measured: twoLines });
        const result = await service.prepare(snapshotFor());
        expect(result.confirmationReasons).toEqual(['layout_differs']);
        expect(result.requiresConfirmation).toBe(true);
        expect(result.readyToSubmit).toBe(false);
      });

      it('asks when only the overflow answer differs, and lists it before the other reasons', async () => {
        const { service } = setup({ queue: { status: 'paused' }, measured: { overflow: true } });
        const result = await service.prepare(snapshotFor());
        expect(result.confirmationReasons).toEqual(['layout_differs', 'overflow_clipped', 'printer_unavailable']);
      });

      it('does not ask for a small shift of a line box, which is only logged', async () => {
        const { service } = setup({ measured: { lineRectsPt: [{ x: 0.4, y: 0, width: 10, height: 10 }] } });
        const result = await service.prepare(snapshotFor());
        expect(result.confirmationReasons).toEqual([]);
        expect(result.readyToSubmit).toBe(true);
      });

      it('still refuses a page of the wrong size', async () => {
        const { service } = setup({ measured: { logicalWidthPt: 200 } });
        await expect(service.prepare(snapshotFor())).rejects.toThrow(/page dimensions mismatch/);
      });
    });

    it('refuses when no queue is selected for the profile or the print window is gone', async () => {
      const { service } = setup();
      await expect(service.prepare(snapshotFor({ profile: '2x1' }))).rejects.toThrow(/No printer queue is selected/);

      const gone = setup();
      gone.service.setWindows({ isDestroyed: () => false, webContents: { send: vi.fn() } } as unknown as BrowserWindow, {
        isDestroyed: () => true,
      } as unknown as BrowserWindow);
      await expect(gone.service.prepare(snapshotFor())).rejects.toThrow(/unavailable/);
    });

    it('refuses a second preparation while one is still measuring', async () => {
      const { service, printWindow } = setup();
      // The print window never answers the first job.
      (printWindow.webContents.send as ReturnType<typeof vi.fn>).mockImplementation(() => {});

      const first = service.prepare(snapshotFor());
      first.catch(() => {});
      await expect(service.prepare(snapshotFor())).rejects.toThrow(/in progress/);

      await vi.advanceTimersByTimeAsync(15_000);
      await expect(first).rejects.toThrow(/timed out after 15 seconds/);
    });

    it('does not send a job until the print page says it is listening', async () => {
      const { service, printWindow } = setup({ listening: false });
      const send = printWindow.webContents.send as ReturnType<typeof vi.fn>;

      const prepared = service.prepare(snapshotFor());
      await vi.advanceTimersByTimeAsync(5_000);
      expect(send).not.toHaveBeenCalled();

      service.handlePrintWindowListening();
      await expect(prepared).resolves.toMatchObject({ readyToSubmit: true });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('gives up with a clear message if the print page never starts', async () => {
      const { service, printWindow } = setup({ listening: false });

      const prepared = service.prepare(snapshotFor());
      prepared.catch(() => {});
      await vi.advanceTimersByTimeAsync(15_000);

      await expect(prepared).rejects.toThrow(/print renderer did not start/);
      expect(printWindow.webContents.send).not.toHaveBeenCalled();
      // The lock is released, so a later attempt can still work once the page is up.
      service.handlePrintWindowListening();
      await expect(service.prepare(snapshotFor())).resolves.toMatchObject({ readyToSubmit: true });
    });

    it('waits again after the print page reloads', async () => {
      const { service, printWindow, windowHandlers } = setup();
      await service.prepare(snapshotFor());

      windowHandlers['did-start-loading']();
      const send = printWindow.webContents.send as ReturnType<typeof vi.fn>;
      send.mockClear();

      const prepared = service.prepare(snapshotFor());
      await vi.advanceTimersByTimeAsync(1_000);
      expect(send).not.toHaveBeenCalled();

      service.handlePrintWindowListening();
      await expect(prepared).resolves.toBeTruthy();
    });

    it('rejects a page size that differs from what the editor measured', async () => {
      const { service } = setup({ measured: { logicalWidthPt: 100 } });
      await expect(service.prepare(snapshotFor())).rejects.toThrow(/page dimensions mismatch/);
    });
  });

  describe('confirm', () => {
    it('prints once to the exact queue with the profile page size and reports the result', async () => {
      const { service, printCalls, stateEvents } = setup();
      const snapshot = snapshotFor({ copies: 3 });
      const { token } = await service.prepare(snapshot);

      const result = service.confirm(token!, snapshot.requestId);
      expect(service.isBusy()).toBe(true);
      expect(printCalls).toHaveLength(1);
      expect(printCalls[0].options).toMatchObject({
        silent: true,
        deviceName: 'iDPRT SP410BT',
        pageSize: { width: 101600, height: 152400 },
        landscape: false,
        copies: 3,
        pagesPerSheet: 1,
        header: '',
        footer: '',
      });

      printCalls[0].callback(true, '');
      await expect(result).resolves.toEqual({ ok: true, value: undefined });
      expect(service.isBusy()).toBe(false);
      expect(stateEvents.map((e) => e.state)).toEqual(['submitting', 'submitted']);
      expect(stateEvents[1].detail).toBe('Sent to iDPRT SP410BT — 3 label(s).');
    });

    it('uses the DYMO 30334 landscape page for the 2 x 1 profile', async () => {
      const { service, printCalls } = setup({ queue: { profile: '2x1', deviceName: 'iDPRT SP310', displayName: 'iDPRT SP310' } });
      const snapshot = snapshotFor({
        profile: '2x1',
        orientation: 'landscape',
        expectedLayout: { ...snapshotFor().expectedLayout, logicalWidthPt: 162, logicalHeightPt: 90 },
      });
      const { token } = await service.prepare(snapshot);
      void service.confirm(token!, snapshot.requestId);
      expect(printCalls[0].options.pageSize).toEqual({ width: 57150, height: 31750 });
      expect(printCalls[0].options.deviceName).toBe('iDPRT SP310');
    });

    it('reports a failed submission and frees the lock without retrying', async () => {
      const { service, printCalls, stateEvents } = setup();
      const snapshot = snapshotFor();
      const { token } = await service.prepare(snapshot);

      const result = service.confirm(token!, snapshot.requestId);
      printCalls[0].callback(false, 'cancelled');
      const outcome = await result;

      expect(outcome).toMatchObject({ ok: false, error: { code: 'PRINT_SUBMISSION_FAILED' } });
      expect(service.isBusy()).toBe(false);
      expect(stateEvents.at(-1)).toMatchObject({ state: 'failed', detail: 'cancelled' });
      expect(printCalls).toHaveLength(1);
    });

    it('treats a print call that throws as a failure', async () => {
      const { service, printWindow, stateEvents } = setup();
      (printWindow.webContents.print as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('window destroyed');
      });
      const snapshot = snapshotFor();
      const { token } = await service.prepare(snapshot);

      await expect(service.confirm(token!, snapshot.requestId)).resolves.toMatchObject({ ok: false });
      expect(service.isBusy()).toBe(false);
      expect(stateEvents.at(-1)?.state).toBe('failed');
    });

    it('reports an unknown outcome when the OS never answers, frees the lock, and still takes a late answer', async () => {
      const { service, printCalls, stateEvents } = setup();
      const snapshot = snapshotFor();
      const { token } = await service.prepare(snapshot);

      const result = service.confirm(token!, snapshot.requestId);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(service.isBusy()).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      const outcome = await result;
      expect(outcome).toMatchObject({ ok: false, error: { code: 'PRINT_OUTCOME_UNCERTAIN' } });
      expect(stateEvents.at(-1)?.state).toBe('uncertain');
      // The lock is free so the user can act, but nothing is retried.
      expect(service.isBusy()).toBe(false);
      expect(printCalls).toHaveLength(1);

      // The spooler finally answers.
      printCalls[0].callback(true, '');
      expect(stateEvents.at(-1)).toMatchObject({ state: 'submitted' });
      expect(printCalls).toHaveLength(1);
    });

    it('rejects an unknown token, a token for another request, and a cancelled preparation', async () => {
      const { service, printCalls } = setup();
      const snapshot = snapshotFor();
      const { token } = await service.prepare(snapshot);

      await expect(service.confirm('nope', snapshot.requestId)).resolves.toMatchObject({ ok: false });
      await expect(service.confirm(token!, randomUUID())).resolves.toMatchObject({ ok: false });

      service.cancel(token!);
      await expect(service.confirm(token!, snapshot.requestId)).resolves.toMatchObject({ ok: false });
      expect(printCalls).toHaveLength(0);
    });

    it('rejects an expired token', async () => {
      const { service, printCalls } = setup();
      const snapshot = snapshotFor();
      const { token } = await service.prepare(snapshot);

      await vi.advanceTimersByTimeAsync(60_001);
      await expect(service.confirm(token!, snapshot.requestId)).resolves.toMatchObject({
        ok: false,
        error: { code: 'PRINT_PREPARATION_FAILED' },
      });
      expect(printCalls).toHaveLength(0);
    });

    it('never prints an older label after a newer one was prepared', async () => {
      const { service, printCalls } = setup();
      const first = snapshotFor({ text: 'first' });
      const second = snapshotFor({ text: 'second' });
      const a = await service.prepare(first);
      const b = await service.prepare(second);

      // The print window now holds the second label, so the first token must not print it.
      await expect(service.confirm(a.token!, first.requestId)).resolves.toMatchObject({
        ok: false,
        error: { code: 'PRINT_PREPARATION_FAILED' },
      });
      expect(printCalls).toHaveLength(0);

      void service.confirm(b.token!, second.requestId);
      expect(printCalls).toHaveLength(1);
    });

    it('refuses to confirm while another job is being submitted', async () => {
      const { service, printCalls } = setup();
      const first = snapshotFor();
      const { token: firstToken } = await service.prepare(first);
      void service.confirm(firstToken!, first.requestId);
      expect(service.isBusy()).toBe(true);

      await expect(service.prepare(snapshotFor())).rejects.toThrow(/in progress/);
      expect(printCalls).toHaveLength(1);
    });

    it('stops confirming when the selected queue disappeared after preparation', async () => {
      const { service, printCalls, printerService } = setup();
      const snapshot = snapshotFor();
      const { token } = await service.prepare(snapshot);

      (printerService.getSelectedQueue as ReturnType<typeof vi.fn>).mockReturnValue(null);
      await expect(service.confirm(token!, snapshot.requestId)).resolves.toMatchObject({
        ok: false,
        error: { code: 'PRINTER_NOT_FOUND' },
      });
      expect(printCalls).toHaveLength(0);
    });
  });

  it('keeps only the most recent request statuses', async () => {
    const { service, printCalls } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      const snapshot = snapshotFor();
      ids.push(snapshot.requestId);
      const { token } = await service.prepare(snapshot);
      const done = service.confirm(token!, snapshot.requestId);
      printCalls.at(-1)!.callback(true, '');
      await done;
    }

    expect(service.getStatus(ids[0]).state).toBe('idle'); // forgotten
    expect(service.getStatus(ids[59]).state).toBe('submitted');
  });
});
