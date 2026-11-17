import type { BrowserWindow } from 'electron';
import type { NormalizedQueue } from '@shared/contracts';
import { isSp410Eligible, detectTransport } from '../platform/printerAdapter';
import { inspectWindowsPrinter } from '../platform/windowsAdapter';
import { inspectMacosPrinter } from '../platform/macosAdapter';
import type { SettingsService } from './settingsService';

export class PrinterService {
  private cachedQueues: NormalizedQueue[] = [];
  private selectedQueue: NormalizedQueue | null = null;
  private settingsService: SettingsService;
  private mainWindow: BrowserWindow | null = null;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  async scan(): Promise<NormalizedQueue[]> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return this.cachedQueues;
    }

    try {
      const printers = await this.mainWindow.webContents.getPrintersAsync();
      const normalizedList: NormalizedQueue[] = [];

      for (const p of printers) {
        const isEligible = isSp410Eligible(p.name, (p as any).driverName || '', (p as any).model || '');
        const transport = detectTransport((p as any).portName || '', p.name);

        // Inspect capabilities
        let caps: {
          status: any;
          transport: any;
          paperDimensionsMm?: { width: number; height: number };
          hardMarginsMm?: { left: number; top: number; right: number; bottom: number };
          resolutionDpi?: { x: number; y: number };
        } = {
          status: p.status === 0 ? 'ready' : 'unknown',
          transport,
          paperDimensionsMm: { width: 101.6, height: 152.4 },
          hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
          resolutionDpi: { x: 203, y: 203 },
        };

        try {
          if (process.platform === 'win32') {
            const inspected = await inspectWindowsPrinter(p.name);
            caps = { ...caps, ...inspected };
          } else if (process.platform === 'darwin') {
            const inspected = await inspectMacosPrinter(p.name);
            caps = { ...caps, ...inspected };
          }
        } catch (err) {
          console.warn(`Capability inspection for ${p.name} failed:`, err);
        }

        normalizedList.push({
          displayName: p.displayName || p.name,
          deviceName: p.name,
          isDefault: p.isDefault || false,
          model: (p as any).model || '',
          driver: (p as any).driverName || '',
          port: (p as any).portName || '',
          transport: caps.transport,
          status: caps.status,
          paperDimensionsMm: caps.paperDimensionsMm,
          hardMarginsMm: caps.hardMarginsMm,
          resolutionDpi: caps.resolutionDpi,
          isEligibleSp410: isEligible,
          requiresManualConfirmation: !isEligible,
          queryTimestamp: Date.now(),
        });
      }

      this.cachedQueues = normalizedList;

      // Reconcile with saved printer preference
      const savedPref = this.settingsService.getPreferences().printer;
      if (savedPref) {
        const matching = this.cachedQueues.find((q) => q.deviceName === savedPref.deviceName);
        if (matching) {
          this.selectedQueue = matching;
        } else {
          // Saved queue is currently missing: retain preference but do not silently switch
          this.selectedQueue = null;
        }
      } else {
        // Pick first eligible SP410 queue
        const firstEligible = this.cachedQueues.find((q) => q.isEligibleSp410);
        this.selectedQueue = firstEligible || null;
      }

      return this.cachedQueues;
    } catch (err) {
      console.error('getPrintersAsync failed:', err);
      return this.cachedQueues;
    }
  }

  async selectQueue(deviceName: string, manualConfirm = false): Promise<NormalizedQueue | null> {
    const queue = this.cachedQueues.find((q) => q.deviceName === deviceName);
    if (!queue) return null;

    if (!queue.isEligibleSp410 && !manualConfirm) {
      throw new Error('This printer is not identified as an iDPRT SP410. Confirmation is required.');
    }

    this.selectedQueue = queue;

    await this.settingsService.update({
      printer: {
        deviceName: queue.deviceName,
        platform: process.platform === 'darwin' ? 'darwin' : 'win32',
        identityFingerprint: `${queue.model}:${queue.driver}:${queue.port}`,
        manualSp410Confirmed: manualConfirm,
        usbConfirmed: queue.transport === 'usb' || manualConfirm,
      },
    });

    return this.selectedQueue;
  }

  getSelectedQueue(): NormalizedQueue | null {
    return this.selectedQueue;
  }
}
