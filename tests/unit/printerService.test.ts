import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { PreferencesUpdate, PreferencesV2 } from '@shared/contracts';
import { createDefaultPreferences } from '@shared/defaults';
import { PrinterService } from '@main/services/printerService';
import type { SettingsService } from '@main/services/settingsService';

// Fake OS queues. The Windows (registry/PowerShell) and Electron/macOS enumeration
// paths read from the same list, and every test runs once for each platform.
const fake = vi.hoisted(() => {
  const state = { printers: [] as Array<{ name: string; driver: string; port: string }> };
  const transportOf = (port: string) =>
    /usb/i.test(port) ? 'usb' : /bth|bluetooth/i.test(port) ? 'bluetooth' : /ip_|tcp|wsd/i.test(port) ? 'network' : 'unknown';
  const inspect = async (name: string) => {
    const printer = state.printers.find((candidate) => candidate.name === name);
    return { status: 'ready', transport: transportOf(printer?.port ?? '') };
  };
  // What macOS CUPS reports as the device URI for a queue on that port.
  const uriOf = (port: string) =>
    /usb/i.test(port) ? 'usb://iDPRT/Printer' : /ip_/i.test(port) ? 'ipp://10.0.0.9/ipp/print' : /bth|bluetooth/i.test(port) ? 'bluetooth://00-11-22' : '';
  return { state, inspect, uriOf };
});

vi.mock('@main/platform/windowsAdapter', () => ({
  enumerateWindowsPrinters: async () =>
    fake.state.printers.map((p) => ({
      name: p.name,
      displayName: p.name,
      driverName: p.driver,
      portName: p.port,
      isDefault: false,
    })),
  inspectWindowsPrinter: (name: string) => fake.inspect(name),
}));
vi.mock('@main/platform/macosAdapter', () => ({
  inspectMacosPrinter: (name: string) => fake.inspect(name),
}));

function makeSettings() {
  let prefs: PreferencesV2 = createDefaultPreferences();
  const update = vi.fn(async (partial: PreferencesUpdate) => {
    prefs = { ...prefs, ...partial, profiles: partial.profiles ?? prefs.profiles };
  });
  const settings = {
    getPreferences: () => structuredClone(prefs),
    update,
  } as unknown as SettingsService;
  return { settings, update, current: () => prefs };
}

function makeWindow(): BrowserWindow {
  return {
    isDestroyed: () => false,
    webContents: {
      getPrintersAsync: async () =>
        fake.state.printers.map((p) => ({
          name: p.name,
          displayName: p.name,
          description: p.driver,
          status: 0,
          isDefault: false,
          options: { 'device-uri': fake.uriOf(p.port) },
        })),
    },
  } as unknown as BrowserWindow;
}

async function newService() {
  const harness = makeSettings();
  const service = new PrinterService(harness.settings);
  service.setMainWindow(makeWindow());
  await service.scan();
  return { service, ...harness };
}

describe.each(['win32', 'darwin'] as const)('PrinterService queue selection on %s', (platform) => {
  const realPlatform = process.platform;
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: platform });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fake.state.printers = [
      { name: 'iDPRT SP410BT', driver: 'iDPRT SP410BT', port: 'USB001' },
      { name: 'iDPRT SP310', driver: 'iDPRT SP310', port: 'COM5' }, // right model, connection type unreadable
      { name: 'Front Desk Labels', driver: 'Generic Thermal', port: 'USB003' }, // renamed
      { name: 'Office Network Printer', driver: 'Generic', port: 'IP_10.0.0.9' },
    ];
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
  });

  it('auto-selects only the detected USB queue', async () => {
    const { service } = await newService();
    expect(service.getSelectedQueue('4x6')?.deviceName).toBe('iDPRT SP410BT');
    expect(service.getSelectedQueue('2x1')).toBeNull();
  });

  it('refuses a correctly named queue until the user confirms it is USB, then remembers that', async () => {
    const { service, update, current } = await newService();

    await expect(service.selectQueue('2x1', 'iDPRT SP310', false)).rejects.toThrow(/USB/);
    expect(service.getSelectedQueue('2x1')).toBeNull();
    expect(update).not.toHaveBeenCalled();

    const selected = await service.selectQueue('2x1', 'iDPRT SP310', true);
    expect(selected?.requiresManualConfirmation).toBe(false);
    expect(service.getSelectedQueue('2x1')?.deviceName).toBe('iDPRT SP310');
    expect(current().profiles['2x1'].printer).toMatchObject({ deviceName: 'iDPRT SP310', usbConfirmed: true });

    // A later scan restores the confirmed selection without asking again.
    await service.scan();
    expect(service.getSelectedQueue('2x1')?.deviceName).toBe('iDPRT SP310');
    expect(service.getSelectedQueue('2x1')?.requiresManualConfirmation).toBe(false);
  });

  it('drops the confirmation when the queue now reports a different driver', async () => {
    const { service } = await newService();
    await service.selectQueue('2x1', 'iDPRT SP310', true);

    fake.state.printers[1] = { name: 'iDPRT SP310', driver: 'iDPRT SP310 v2', port: 'COM5' };
    await service.scan();

    expect(service.getSelectedQueue('2x1')).toBeNull();
  });

  it('never assigns a queue that belongs to the other profile', async () => {
    const { service } = await newService();
    await expect(service.selectQueue('4x6', 'iDPRT SP310', true)).rejects.toThrow(/another label profile/);
    await expect(service.selectQueue('2x1', 'iDPRT SP410BT', true)).rejects.toThrow(/another label profile/);
  });

  it('assigns an unidentified queue only through the explicit override', async () => {
    const { service } = await newService();
    await expect(service.selectQueue('2x1', 'Front Desk Labels', false)).rejects.toThrow(/not identified/);

    const selected = await service.selectQueue('2x1', 'Front Desk Labels', true);
    expect(selected?.profile).toBe('2x1');
    await service.scan();
    expect(service.getSelectedQueue('2x1')?.deviceName).toBe('Front Desk Labels');
  });

  it('rejects network and Bluetooth queues even when the user confirms them', async () => {
    const { service } = await newService();
    await expect(service.selectQueue('2x1', 'Office Network Printer', true)).rejects.toThrow(/not supported/);
  });
});
