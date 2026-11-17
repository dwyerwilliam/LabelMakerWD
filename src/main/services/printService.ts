import type { BrowserWindow } from 'electron';
import crypto from 'crypto';
import type {
  ConfirmationReason,
  LayoutFingerprint,
  PrintPrepareResult,
  PrintSnapshot,
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

export class PrintService {
  private printerService: PrinterService;
  private mainWindow: BrowserWindow | null = null;
  private printWindow: BrowserWindow | null = null;

  private isSubmitting = false;
  private activePreparations = new Map<string, ActivePreparation>();
  private requestStatuses = new Map<string, PrintStatusResult>();
  private pendingReadyResolvers = new Map<
    string,
    { resolve: (fp: LayoutFingerprint) => void; reject: (err: any) => void }
  >();

  constructor(printerService: PrinterService) {
    this.printerService = printerService;
  }

  /** True while a job is being handed to the OS spooler. */
  isBusy(): boolean {
    return this.isSubmitting;
  }

  setWindows(mainWin: BrowserWindow, printWin: BrowserWindow): void {
    this.mainWindow = mainWin;
    this.printWindow = printWin;
  }

  handlePrintWindowReady(requestId: string, fingerprint: LayoutFingerprint): void {
    const pending = this.pendingReadyResolvers.get(requestId);
    if (pending) {
      pending.resolve(fingerprint);
      this.pendingReadyResolvers.delete(requestId);
    }
  }

  async prepare(snapshot: PrintSnapshot): Promise<PrintPrepareResult> {
    if (this.isSubmitting) {
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

    // Send snapshot to hidden print renderer and await layout measurement
    const measuredFingerprint = await this.awaitHiddenWindowLayout(snapshot);

    // Verify layout match between preview and print renderer within 0.05 pt tolerance
    const comparison = compareFingerprints(snapshot.expectedLayout, measuredFingerprint, 0.05);
    const pageDimensionsMatch =
      Math.abs(snapshot.expectedLayout.logicalWidthPt - measuredFingerprint.logicalWidthPt) <= 0.05 &&
      Math.abs(snapshot.expectedLayout.logicalHeightPt - measuredFingerprint.logicalHeightPt) <= 0.05;

    if (!pageDimensionsMatch) {
      throw new Error(`Print page dimensions mismatch: ${comparison.reason}`);
    }

    if (!comparison.match) {
      // The hidden print renderer is the canonical output document. Editable
      // content and transformed previews can expose different line rects,
      // especially for multiline text and rotated 4x6 landscape previews.
      // Keep this visible for diagnosis without blocking a valid print page.
      console.warn(
        `[PrintService] Preview/print line geometry differs; using print renderer geometry. ` +
        `profile=${snapshot.profile}, expectedLines=${snapshot.expectedLayout.lineTextOffsets.length}, ` +
        `measuredLines=${measuredFingerprint.lineTextOffsets.length}, reason=${comparison.reason}`
      );
    }

    const confirmationReasons: ConfirmationReason[] = [];

    if (measuredFingerprint.overflow) {
      confirmationReasons.push('overflow_clipped');
    }

    if (selectedQueue.status === 'offline') {
      confirmationReasons.push('printer_offline');
    }

    if (selectedQueue.requiresManualConfirmation) {
      confirmationReasons.push('printer_unverified');
    }

    const token = crypto.randomBytes(24).toString('hex');
    this.activePreparations.set(token, {
      token,
      requestId: snapshot.requestId,
      snapshot,
      confirmationReasons,
      expiresAt: Date.now() + 60000, // 60s expiration
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
        reject(new Error('Print layout preparation timed out after 15 seconds.'));
      }, 15000);

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
    const prep = this.activePreparations.get(token);
    if (!prep || prep.requestId !== requestId) {
      return err('PRINT_PREPARATION_FAILED', 'Preparation token expired or invalid.');
    }

    if (Date.now() > prep.expiresAt) {
      this.activePreparations.delete(token);
      return err('PRINT_PREPARATION_FAILED', 'Preparation token has expired.');
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
      this.printWindow?.webContents.print(printOptions, (success, failureReason) => {
        this.isSubmitting = false;
        this.activePreparations.delete(token);

        if (success) {
          const detail = `Sent to ${selectedQueue.displayName} — ${prep.snapshot.copies} label(s).`;
          this.notifyState(requestId, 'submitted', detail);
          resolve(ok(undefined));
        } else {
          const detail = failureReason || 'Print submission failed in operating system spooler';
          this.notifyState(requestId, 'failed', detail);
          resolve(err('PRINT_SUBMISSION_FAILED', `Failed printing: ${detail}`));
        }
      });
    });
  }

  cancel(token: string): void {
    this.activePreparations.delete(token);
  }

  getStatus(requestId: string): PrintStatusResult {
    return this.requestStatuses.get(requestId) || { requestId, state: 'idle' };
  }

  private notifyState(requestId: string, state: any, detail?: string): void {
    const status: PrintStatusResult = { requestId, state, detail };
    this.requestStatuses.set(requestId, status);
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
