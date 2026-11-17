import type { BrowserWindow } from 'electron';
import type { NormalizedQueue, PrinterProfile, QueueStatus } from '@shared/contracts';
import { PRINTER_PROFILES, SP310_OUTPUT_HEIGHT_IN, SP310_OUTPUT_WIDTH_IN } from '@shared/defaults';
import { identifyPrinterProfile, detectTransport } from '../platform/printerAdapter';
import { enumerateWindowsPrinters, inspectWindowsPrinter } from '../platform/windowsAdapter';
import { inspectMacosPrinter } from '../platform/macosAdapter';
import type { SettingsService } from './settingsService';

const PROFILE_PAPER_DIMENSIONS: Record<PrinterProfile, { width: number; height: number }> = {
  '4x6': { width: 101.6, height: 152.4 },
  // DYMO 30334 is nominally 2.25in x 1.25in, emitted landscape.
  '2x1': { width: SP310_OUTPUT_WIDTH_IN * 25.4, height: SP310_OUTPUT_HEIGHT_IN * 25.4 },
};

interface InspectableCapabilities {
  status: QueueStatus;
  transport: NormalizedQueue['transport'];
  paperDimensionsMm?: { width: number; height: number };
  hardMarginsMm?: { left: number; top: number; right: number; bottom: number };
  resolutionDpi?: { x: number; y: number };
}

function defaultCapabilities(profile: PrinterProfile | null, transport: NormalizedQueue['transport']): InspectableCapabilities {
  return {
    status: 'unknown',
    transport,
    paperDimensionsMm: profile ? PROFILE_PAPER_DIMENSIONS[profile] : undefined,
    hardMarginsMm: profile ? { left: 0, top: 0, right: 0, bottom: 0 } : undefined,
    resolutionDpi: profile ? { x: 203, y: 203 } : undefined,
  };
}

export class PrinterService {
  private cachedQueues: NormalizedQueue[] = [];
  private selectedQueues: Record<PrinterProfile, NormalizedQueue | null> = {
    '4x6': null,
    '2x1': null,
  };
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
      console.log('[PrinterService] scan started');
      let electronPrinters: Electron.PrinterInfo[] = [];
      let printers: Electron.PrinterInfo[] = [];

      // On Windows, use the OS queue registry as the primary source. This
      // avoids blocking or failure in Electron's printer API from hiding
      // otherwise-installed USB queues.
      if (process.platform === 'win32') {
        const windowsPrinters = await enumerateWindowsPrinters();
        printers = windowsPrinters.map((printer) => {
          const result = {
            name: printer.name,
            displayName: printer.displayName,
            description: printer.driverName,
            status: 0,
            isDefault: printer.isDefault,
          } as Electron.PrinterInfo;
          (result as any).driverName = printer.driverName;
          (result as any).portName = printer.portName;
          return result;
        });
        console.log(`[PrinterService] Windows queue discovery returned ${printers.length} printer(s)`);
      }

      if (printers.length === 0) {
        try {
          electronPrinters = await this.mainWindow.webContents.getPrintersAsync();
          console.log(`[PrinterService] Electron returned ${electronPrinters.length} printer(s)`);
        } catch (err) {
          console.warn('[PrinterService] Electron printer enumeration failed; using cached queues.', err);
        }
        printers = await this.mergeWindowsPrinterMetadata(electronPrinters);
      }

      console.log(`[PrinterService] printer enumeration returned ${printers.length} printer(s)`);
      const normalizedList: NormalizedQueue[] = [];

      for (const p of printers) {
        const driverName = (p as any).driverName || p.description || '';
        const portName = (p as any).portName || '';
        const model = (p as any).model || '';
        const profile = identifyPrinterProfile(p.name, driverName, model);
        const detectedTransport = detectTransport(portName, p.name);

        console.log(
          `[PrinterService] Printer: name="${p.name}", displayName="${p.displayName}", ` +
          `driver="${driverName}", port="${portName}", profile=${profile || 'unknown'}`
        );

        let caps = defaultCapabilities(profile, detectedTransport);
        if (profile) {
          try {
            if (process.platform === 'win32') {
              const inspected = await inspectWindowsPrinter(p.name, profile);
              // Keep transport discovered from the queue port when the
              // capability query is unavailable or returns an unknown value.
              caps = {
                ...caps,
                ...inspected,
                transport: inspected.transport === 'unknown' ? detectedTransport : inspected.transport,
              };
            } else if (process.platform === 'darwin') {
              const inspected = await inspectMacosPrinter(p.name, profile);
              caps = { ...caps, ...inspected };
            } else {
              caps.status = p.status === 0 ? 'ready' : 'unknown';
            }
          } catch (err) {
            console.warn(`Capability inspection for ${p.name} failed:`, err);
          }
        }

        normalizedList.push({
          displayName: p.displayName || p.name,
          deviceName: p.name,
          isDefault: p.isDefault || false,
          model,
          driver: driverName,
          port: portName,
          transport: caps.transport,
          status: caps.status,
          paperDimensionsMm: caps.paperDimensionsMm,
          hardMarginsMm: caps.hardMarginsMm,
          resolutionDpi: caps.resolutionDpi,
          profile,
          requiresManualConfirmation: profile === null || caps.transport !== 'usb',
          queryTimestamp: Date.now(),
        });
      }

      this.cachedQueues = normalizedList;
      this.reconcileSelections();
      console.log(
        `[PrinterService] Selected queues: 4x6=${this.selectedQueues['4x6']?.deviceName || 'none'}, ` +
        `2x1=${this.selectedQueues['2x1']?.deviceName || 'none'}`
      );
      return this.cachedQueues;
    } catch (err) {
      console.error('getPrintersAsync failed:', err);
      return this.cachedQueues;
    }
  }

  private async mergeWindowsPrinterMetadata(printers: Electron.PrinterInfo[]): Promise<Electron.PrinterInfo[]> {
    if (process.platform !== 'win32') return printers;

    const profilesFound = new Set(
      printers
        .map((printer) => identifyPrinterProfile(
        printer.name,
        (printer as any).driverName || printer.description || '',
        (printer as any).model || ''
        ))
        .filter((profile): profile is PrinterProfile => profile !== null)
    );
    const hasIncompleteSupportedQueue = printers.some((printer) => {
      const profile = identifyPrinterProfile(
        printer.name,
        (printer as any).driverName || printer.description || '',
        (printer as any).model || ''
      );
      return profile !== null && !(String((printer as any).portName || '').trim());
    });
    const hasBothProfiles = PRINTER_PROFILES.every((profile) => profilesFound.has(profile));
    if (hasBothProfiles && !hasIncompleteSupportedQueue) return printers;

    const windowsPrinters = await enumerateWindowsPrinters();
    if (windowsPrinters.length === 0) return printers;

    const merged = [...printers] as Electron.PrinterInfo[];
    for (const fallback of windowsPrinters) {
      const existingIndex = merged.findIndex((printer) =>
        printer.name.toLowerCase() === fallback.name.toLowerCase() ||
        (printer.displayName || '').toLowerCase() === fallback.displayName.toLowerCase()
      );

      if (existingIndex >= 0) {
        const existing = merged[existingIndex] as any;
        merged[existingIndex] = {
          ...existing,
          displayName: existing.displayName || fallback.displayName,
          description: existing.description || fallback.driverName,
          driverName: existing.driverName || fallback.driverName,
          portName: existing.portName || fallback.portName,
          isDefault: existing.isDefault || fallback.isDefault,
        } as Electron.PrinterInfo;
      } else {
        merged.push({
          name: fallback.name,
          displayName: fallback.displayName,
          description: fallback.driverName,
          status: 0,
          isDefault: fallback.isDefault,
        } as Electron.PrinterInfo);
        (merged[merged.length - 1] as any).driverName = fallback.driverName;
        (merged[merged.length - 1] as any).portName = fallback.portName;
      }
    }

    console.warn(`[PrinterService] Merged ${windowsPrinters.length} Windows queue(s) to recover missing or incomplete printer metadata.`);
    return merged;
  }

  private reconcileSelections(): void {
    const preferences = this.settingsService.getPreferences();

    for (const profile of PRINTER_PROFILES) {
      const savedChoice = preferences.profiles[profile].printer;
      const savedQueue = savedChoice
        ? this.cachedQueues.find((queue) => queue.deviceName === savedChoice.deviceName)
        : undefined;

      if (savedQueue && (savedQueue.profile === profile || (savedQueue.profile === null && savedChoice?.manualProfileConfirmed))) {
        this.selectedQueues[profile] = savedQueue.profile === profile
          ? savedQueue
          : { ...savedQueue, profile, requiresManualConfirmation: false };
        continue;
      }

      this.selectedQueues[profile] = this.cachedQueues.find(
        (queue) => queue.profile === profile && !queue.requiresManualConfirmation
      ) || null;
    }
  }

  async selectQueue(profile: PrinterProfile, deviceName: string, manualConfirm = false): Promise<NormalizedQueue | null> {
    const queue = this.cachedQueues.find((candidate) => candidate.deviceName === deviceName);
    if (!queue) return null;

    if (queue.profile !== profile && !manualConfirm) {
      throw new Error(`This printer is not identified as the selected ${profile} printer profile.`);
    }
    if (queue.profile && queue.profile !== profile) {
      throw new Error('This printer is already assigned to another label profile.');
    }
    if (!manualConfirm && queue.requiresManualConfirmation) {
      throw new Error('USB confirmation is required for this printer queue.');
    }

    const selected = {
      ...queue,
      profile,
      requiresManualConfirmation: false,
    } satisfies NormalizedQueue;
    this.selectedQueues[profile] = selected;

    const preferences = this.settingsService.getPreferences();
    await this.settingsService.update({
      profiles: {
        ...preferences.profiles,
        [profile]: {
          ...preferences.profiles[profile],
          printer: {
            deviceName: selected.deviceName,
            platform: process.platform === 'darwin' ? 'darwin' : 'win32',
            identityFingerprint: `${selected.model}:${selected.driver}:${selected.port}`,
            manualProfileConfirmed: manualConfirm,
            usbConfirmed: selected.transport === 'usb' || manualConfirm,
          },
        },
      },
    });

    return selected;
  }

  getSelectedQueue(profile: PrinterProfile): NormalizedQueue | null {
    return this.selectedQueues[profile];
  }

  getQueues(): NormalizedQueue[] {
    return this.cachedQueues;
  }
}
