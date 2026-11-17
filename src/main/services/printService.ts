import type { BrowserWindow } from 'electron';
import crypto from 'crypto';
import type {
  ConfirmationReason,
  LayoutFingerprint,
  PrintPrepareResult,
  PrintSnapshot,
  PrintState,
  PrintStatusResult,
  PrinterProfile,
} from '@shared/contracts';
import { SP310_OUTPUT_HEIGHT_IN, SP310_OUTPUT_WIDTH_IN } from '@shared/defaults';
import { compareFingerprints } from '@renderer/label/layout';
import { IPC_CHANNELS } from '@shared/channels';
import { err, ok, type Result } from '@shared/errors';
import type { PrinterService } from './printerService';

interface ActivePreparation {
  token: string;
  requestId: string;
  snapshot: PrintSnapshot;
  confirmationReasons: ConfirmationReason[];
  expiresAt: number;
}

export interface PrintServiceOptions {
  /** How long the hidden print window may take to lay the label out. */
  preparationTimeoutMs?: number;
  /** How long the OS may take to accept a job before the outcome is reported as unknown. */
  submissionTimeoutMs?: number;
  /** How long a prepared label can wait for the user's confirmation. */
  tokenTtlMs?: number;
}

const DEFAULT_PREPARATION_TIMEOUT_MS = 15_000;
const DEFAULT_SUBMISSION_TIMEOUT_MS = 30_000;
const DEFAULT_TOKEN_TTL_MS = 60_000;
const MAX_TRACKED_REQUESTS = 50;

function createGate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

export class PrintService {
  private printerService: PrinterService;
  private mainWindow: BrowserWindow | null = null;
  private printWindow: BrowserWindow | null = null;

  private readonly preparationTimeoutMs: number;
  private readonly submissionTimeoutMs: number;
  private readonly tokenTtlMs: number;

  private isSubmitting = false;
  private isPreparing = false;
  /** Opens once the hidden print page has loaded and is listening; closed again whenever it reloads. */
  private printWindowGate = createGate();
  /** The request whose label is currently laid out in the print window; only that one may be printed. */
  private loadedRequestId: string | null = null;
  private activePreparations = new Map<string, ActivePreparation>();
  private requestStatuses = new Map<string, PrintStatusResult>();
  private pendingReadyResolvers = new Map<
    string,
    { resolve: (fp: LayoutFingerprint) => void; reject: (err: Error) => void }
  >();

  constructor(printerService: PrinterService, options: PrintServiceOptions = {}) {
    this.printerService = printerService;
    this.preparationTimeoutMs = options.preparationTimeoutMs ?? DEFAULT_PREPARATION_TIMEOUT_MS;
    this.submissionTimeoutMs = options.submissionTimeoutMs ?? DEFAULT_SUBMISSION_TIMEOUT_MS;
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
  }

  /** True while a job is being handed to the OS spooler. */
  isBusy(): boolean {
    return this.isSubmitting;
  }

  setWindows(mainWin: BrowserWindow, printWin: BrowserWindow): void {
    this.mainWindow = mainWin;
    this.printWindow = printWin;

    // A new or reloaded print page has not registered its listener yet.
    this.printWindowGate = createGate();
    this.loadedRequestId = null;
    printWin.webContents?.on?.('did-start-loading', () => {
      this.printWindowGate = createGate();
      this.loadedRequestId = null;
    });
  }

  /** The print page is loaded and listening for jobs. */
  handlePrintWindowListening(): void {
    this.printWindowGate.open();
  }

  private waitForPrintWindow(): Promise<void> {
    const gate = this.printWindowGate;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The print renderer did not start. Restart Label Maker and try again.')),
        this.preparationTimeoutMs
      );
      void gate.promise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  handlePrintWindowReady(requestId: string, fingerprint: LayoutFingerprint): void {
    const pending = this.pendingReadyResolvers.get(requestId);
    if (pending) {
      pending.resolve(fingerprint);
      this.pendingReadyResolvers.delete(requestId);
    }
  }

  async prepare(snapshot: PrintSnapshot): Promise<PrintPrepareResult> {
    if (this.isSubmitting || this.isPreparing) {
      throw new Error('A print job is currently in progress. Please wait.');
    }

    const selectedQueue = this.printerService.getSelectedQueue(snapshot.profile);
    if (!selectedQueue) {
      throw new Error(`No printer queue is selected for the ${snapshot.profile} profile.`);
    }
    if (selectedQueue.profile !== snapshot.profile) {
      throw new Error('The selected printer does not match the active label profile.');
    }

    if (!this.printWindow || this.printWindow.isDestroyed()) {
      throw new Error('Print rendering engine is unavailable.');
    }

    this.pruneExpiredPreparations();

    // The print window holds one label at a time. From here until the layout
    // is measured it does not hold any label that may be printed.
    this.loadedRequestId = null;
    this.isPreparing = true;
    let measuredFingerprint: LayoutFingerprint;
    try {
      // A job sent before the print page is listening would be lost.
      await this.waitForPrintWindow();
      // Send snapshot to hidden print renderer and await layout measurement
      measuredFingerprint = await this.awaitHiddenWindowLayout(snapshot);
    } finally {
      this.isPreparing = false;
    }

    // Verify layout match between preview and print renderer within 0.05 pt tolerance
    const comparison = compareFingerprints(snapshot.expectedLayout, measuredFingerprint, 0.05);
    const pageDimensionsMatch =
      Math.abs(snapshot.expectedLayout.logicalWidthPt - measuredFingerprint.logicalWidthPt) <= 0.05 &&
      Math.abs(snapshot.expectedLayout.logicalHeightPt - measuredFingerprint.logicalHeightPt) <= 0.05;

    if (!pageDimensionsMatch) {
      throw new Error(`Print page dimensions mismatch: ${comparison.reason}`);
    }

    if (!comparison.match) {
      // The hidden print renderer is the canonical output document, so a small shift of
      // a line's box is only logged. A different line count, different line starts or a
      // different overflow answer means the paper will not look like the preview: that
      // is put to the user below instead of being printed silently.
      console.warn(
        `[PrintService] Preview/print layout differs (${comparison.kind}); using print renderer geometry. ` +
        `profile=${snapshot.profile}, expectedLines=${snapshot.expectedLayout.lineTextOffsets.length}, ` +
        `measuredLines=${measuredFingerprint.lineTextOffsets.length}, reason=${comparison.reason}`
      );
    }

    const confirmationReasons: ConfirmationReason[] = [];

    if (comparison.kind === 'lines' || comparison.kind === 'overflow') {
      confirmationReasons.push('layout_differs');
    }

    if (measuredFingerprint.overflow) {
      confirmationReasons.push('overflow_clipped');
    }

    // Offline, paused or faulted queues may still accept the job, but the user
    // has to agree: it may print later, or never.
    if (selectedQueue.status === 'offline' || selectedQueue.status === 'paused' || selectedQueue.status === 'error') {
      confirmationReasons.push('printer_unavailable');
    }

    this.loadedRequestId = snapshot.requestId;
    const token = crypto.randomBytes(24).toString('hex');
    this.activePreparations.set(token, {
      token,
      requestId: snapshot.requestId,
      snapshot,
      confirmationReasons,
      expiresAt: Date.now() + this.tokenTtlMs,
    });

    return {
      token,
      readyToSubmit: confirmationReasons.length === 0,
      requiresConfirmation: confirmationReasons.length > 0,
      confirmationReasons,
      snapshot,
    };
  }

  private awaitHiddenWindowLayout(snapshot: PrintSnapshot): Promise<LayoutFingerprint> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingReadyResolvers.delete(snapshot.requestId);
        reject(new Error(`Print layout preparation timed out after ${Math.round(this.preparationTimeoutMs / 1000)} seconds.`));
      }, this.preparationTimeoutMs);

      this.pendingReadyResolvers.set(snapshot.requestId, {
        resolve: (fp) => {
          clearTimeout(timeout);
          resolve(fp);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });

      this.printWindow?.webContents.send(IPC_CHANNELS.PRINT_WINDOW_JOB, snapshot);
    });
  }

  async confirm(token: string, requestId: string): Promise<Result<void>> {
    this.pruneExpiredPreparations();

    const prep = this.activePreparations.get(token);
    if (!prep || prep.requestId !== requestId) {
      return err('PRINT_PREPARATION_FAILED', 'Preparation token expired or invalid.');
    }

    // The print window shows exactly one label. If a newer label was prepared
    // since, printing now would send that one instead of the one confirmed.
    if (this.loadedRequestId !== prep.requestId) {
      this.activePreparations.delete(token);
      return err('PRINT_PREPARATION_FAILED', 'The label changed after it was prepared. Print it again.');
    }

    const selectedQueue = this.printerService.getSelectedQueue(prep.snapshot.profile);
    if (!selectedQueue) {
      return err('PRINTER_NOT_FOUND', 'Selected printer is no longer available.');
    }
    if (selectedQueue.profile !== prep.snapshot.profile) {
      return err('PRINTER_NOT_FOUND', 'Selected printer no longer matches this label profile.');
    }

    if (this.isSubmitting) {
      return err('REQUEST_BUSY', 'Another print job is currently submitting.');
    }

    const printWindow = this.printWindow;
    if (!printWindow || printWindow.isDestroyed()) {
      return err('PRINT_PREPARATION_FAILED', 'Print rendering engine is unavailable.');
    }

    this.isSubmitting = true;
    this.notifyState(requestId, 'submitting', `Sending to ${selectedQueue.displayName}…`);

    const pageSize = getPrintPageSize(prep.snapshot.profile);
    const printOptions: Electron.WebContentsPrintOptions = {
      silent: true,
      deviceName: selectedQueue.deviceName,
      pageSize,
      landscape: false, // Profile mapping is handled in the frozen composition.
      margins: { marginType: 'none' },
      scaleFactor: 100,
      color: false,
      copies: prep.snapshot.copies,
      pagesPerSheet: 1,
      duplexMode: 'simplex',
      header: '',
      footer: '',
    };

    return new Promise((resolve) => {
      let timedOut = false;

      // If the OS never answers, the job may or may not have been spooled.
      // Report that honestly, free the lock so the user can look at the queue,
      // and never retry on their behalf. A late answer still updates the status.
      const watchdog = setTimeout(() => {
        timedOut = true;
        this.isSubmitting = false;
        this.activePreparations.delete(token);
        const detail =
          `The outcome for ${selectedQueue.displayName} is unconfirmed. ` +
          'Check the printer queue before printing again, or a duplicate label may print.';
        this.notifyState(requestId, 'uncertain', detail);
        resolve(err('PRINT_OUTCOME_UNCERTAIN', detail));
      }, this.submissionTimeoutMs);

      const finish = (success: boolean, failureReason: string) => {
        clearTimeout(watchdog);
        if (!timedOut) {
          this.isSubmitting = false;
          this.activePreparations.delete(token);
        }

        if (success) {
          const detail = `Sent to ${selectedQueue.displayName} — ${prep.snapshot.copies} label(s).`;
          this.notifyState(requestId, 'submitted', detail);
          if (!timedOut) resolve(ok(undefined));
        } else {
          const detail = failureReason || 'Print submission failed in operating system spooler';
          this.notifyState(requestId, 'failed', detail);
          if (!timedOut) resolve(err('PRINT_SUBMISSION_FAILED', `Failed printing: ${detail}`));
        }
      };

      try {
        printWindow.webContents.print(printOptions, (success, failureReason) => finish(success, failureReason));
      } catch (error) {
        finish(false, error instanceof Error ? error.message : String(error));
      }
    });
  }

  cancel(token: string): void {
    this.activePreparations.delete(token);
  }

  getStatus(requestId: string): PrintStatusResult {
    return this.requestStatuses.get(requestId) || { requestId, state: 'idle' };
  }

  /** Drops preparations nobody confirmed in time, so they cannot pile up. */
  private pruneExpiredPreparations(): void {
    const now = Date.now();
    for (const [token, prep] of this.activePreparations) {
      if (now > prep.expiresAt) this.activePreparations.delete(token);
    }
  }

  private notifyState(requestId: string, state: PrintState, detail?: string): void {
    const status: PrintStatusResult = { requestId, state, detail };
    this.requestStatuses.delete(requestId);
    this.requestStatuses.set(requestId, status);
    // Keep only the most recent requests (Map keeps insertion order).
    while (this.requestStatuses.size > MAX_TRACKED_REQUESTS) {
      const oldest = this.requestStatuses.keys().next().value;
      if (oldest === undefined) break;
      this.requestStatuses.delete(oldest);
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.PRINT_STATE_EVENT, status);
    }
  }
}

function getPrintPageSize(profile: PrinterProfile): { width: number; height: number } {
  if (profile === '2x1') {
    return {
      width: Math.round(SP310_OUTPUT_WIDTH_IN * 25400),
      height: Math.round(SP310_OUTPUT_HEIGHT_IN * 25400),
    };
  }

  return { width: 101600, height: 152400 };
}
