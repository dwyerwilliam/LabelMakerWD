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
import { readPngDimensions, SHIPPING_HEIGHT_PX, SHIPPING_WIDTH_PX } from '@shared/shipping';
import { compareFingerprints } from '@renderer/label/layout';
import { IPC_CHANNELS } from '@shared/channels';
import { err, ok, type Result } from '@shared/errors';
import type { PrinterService } from './printerService';

interface ActivePreparation {
  token: string;
  requestId: string;
  profile: PrinterProfile;
  copies: number;
  expiresAt: number;
  expiryTimer: ReturnType<typeof setTimeout>;
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

function clearPrintDocument(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) win.webContents.send(IPC_CHANNELS.PRINT_WINDOW_JOB, null);
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
  /** Only the hidden document needs the label content after measurement. */
  private preparation: ActivePreparation | null = null;
  private requestStatuses = new Map<string, PrintStatusResult>();
  private pendingReadyResolvers = new Map<string, (fp: LayoutFingerprint) => void>();

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
    this.forgetPreparation();
    printWin.webContents?.on?.('did-start-loading', () => {
      this.printWindowGate = createGate();
      this.forgetPreparation();
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
    this.pendingReadyResolvers.get(requestId)?.(fingerprint);
  }

  async prepare(snapshot: PrintSnapshot): Promise<PrintPrepareResult> {
    if (this.isSubmitting || this.isPreparing) {
      throw new Error('A print job is currently in progress. Please wait.');
    }

    // A shipping label is an image that must be exactly one 4 × 6 label at 203 dpi. Only its
    // PNG header is read here; the image itself (names, addresses) is never parsed or logged.
    if (snapshot.contentKind === 'image') {
      const dims = snapshot.image ? readPngDimensions(Buffer.from(snapshot.image.pngBase64, 'base64')) : null;
      if (!dims || dims.width !== SHIPPING_WIDTH_PX || dims.height !== SHIPPING_HEIGHT_PX) {
        throw new Error('The shipping label image is not a valid 4 × 6 label image.');
      }
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

    if (this.preparation) this.cancel(this.preparation.token);
    this.isPreparing = true;
    let measuredFingerprint: LayoutFingerprint;
    const printWindow = this.printWindow;
    try {
      // A job sent before the print page is listening would be lost.
      await this.waitForPrintWindow();
      // Send snapshot to hidden print renderer and await layout measurement
      measuredFingerprint = await this.awaitHiddenWindowLayout(snapshot, printWindow);
    } finally {
      this.isPreparing = false;
    }

    // Verify layout match between preview and print renderer within 0.05 pt tolerance
    const comparison = compareFingerprints(snapshot.expectedLayout, measuredFingerprint, 0.05);
    const pageDimensionsMatch =
      Math.abs(snapshot.expectedLayout.logicalWidthPt - measuredFingerprint.logicalWidthPt) <= 0.05 &&
      Math.abs(snapshot.expectedLayout.logicalHeightPt - measuredFingerprint.logicalHeightPt) <= 0.05;

    if (!pageDimensionsMatch) {
      clearPrintDocument(printWindow);
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

    const token = crypto.randomBytes(24).toString('hex');
    this.preparation = {
      token,
      requestId: snapshot.requestId,
      profile: snapshot.profile,
      copies: snapshot.copies,
      expiresAt: Date.now() + this.tokenTtlMs,
      expiryTimer: setTimeout(() => this.cancel(token), this.tokenTtlMs),
    };

    return {
      token,
      readyToSubmit: confirmationReasons.length === 0,
      requiresConfirmation: confirmationReasons.length > 0,
      confirmationReasons,
      snapshot,
    };
  }

  private async awaitHiddenWindowLayout(snapshot: PrintSnapshot, printWindow: BrowserWindow): Promise<LayoutFingerprint> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<LayoutFingerprint>((resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Print layout preparation timed out after ${Math.round(this.preparationTimeoutMs / 1000)} seconds.`));
        }, this.preparationTimeoutMs);
        this.pendingReadyResolvers.set(snapshot.requestId, resolve);
        printWindow.webContents.send(IPC_CHANNELS.PRINT_WINDOW_JOB, snapshot);
      });
    } catch (error) {
      clearPrintDocument(printWindow);
      throw error;
    } finally {
      clearTimeout(timeout);
      this.pendingReadyResolvers.delete(snapshot.requestId);
    }
  }

  async confirm(token: string, requestId: string): Promise<Result<void>> {
    const prep = this.preparation;
    if (!prep || prep.token !== token || prep.requestId !== requestId) {
      return err('PRINT_PREPARATION_FAILED', 'Preparation token expired or invalid.');
    }
    if (Date.now() >= prep.expiresAt) {
      this.cancel(token);
      return err('PRINT_PREPARATION_FAILED', 'Preparation token expired or invalid.');
    }

    const selectedQueue = this.printerService.getSelectedQueue(prep.profile);
    if (!selectedQueue) {
      this.cancel(token);
      return err('PRINTER_NOT_FOUND', 'Selected printer is no longer available.');
    }
    if (selectedQueue.profile !== prep.profile) {
      this.cancel(token);
      return err('PRINTER_NOT_FOUND', 'Selected printer no longer matches this label profile.');
    }

    if (this.isSubmitting) {
      return err('REQUEST_BUSY', 'Another print job is currently submitting.');
    }

    const printWindow = this.printWindow;
    if (!printWindow || printWindow.isDestroyed()) {
      this.cancel(token);
      return err('PRINT_PREPARATION_FAILED', 'Print rendering engine is unavailable.');
    }

    // The spooler now owns this submission. A cancel or expiry must not erase
    // the page while Electron is using it.
    this.forgetPreparation();
    this.isSubmitting = true;
    this.notifyState(requestId, 'submitting', `Sending to ${selectedQueue.displayName}…`);

    const pageSize = getPrintPageSize(prep.profile);
    const printOptions: Electron.WebContentsPrintOptions = {
      silent: true,
      deviceName: selectedQueue.deviceName,
      pageSize,
      landscape: false, // Profile mapping is handled in the frozen composition.
      margins: { marginType: 'none' },
      scaleFactor: 100,
      color: false,
      copies: prep.copies,
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
        clearPrintDocument(printWindow);
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
          clearPrintDocument(printWindow);
        }

        if (success) {
          const detail = `Sent to ${selectedQueue.displayName} — ${prep.copies} label(s).`;
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
    if (this.preparation?.token !== token) return;
    this.forgetPreparation();
    clearPrintDocument(this.printWindow);
  }

  getStatus(requestId: string): PrintStatusResult {
    return this.requestStatuses.get(requestId) || { requestId, state: 'idle' };
  }

  private forgetPreparation(): void {
    if (this.preparation) clearTimeout(this.preparation.expiryTimer);
    this.preparation = null;
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
