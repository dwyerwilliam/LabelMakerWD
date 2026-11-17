import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { PrinterCapabilities } from './printerAdapter';
import { detectTransport } from './printerAdapter';
import { parseHelperOutput, parsePowerShellQueue, parseQueueRows } from './helperOutput';
import type { PrinterProfile } from '@shared/contracts';
import { SP310_OUTPUT_HEIGHT_IN, SP310_OUTPUT_WIDTH_IN } from '@shared/defaults';

export interface WindowsPrinterRecord {
  name: string;
  displayName: string;
  driverName: string;
  portName: string;
  isDefault: boolean;
}

/**
 * Electron's printer enumeration can omit or under-report Windows queues.
 * This read-only fallback uses the same PrintManagement data Windows exposes
 * in Settings and merges only missing/incomplete queue metadata.
 */
export function enumerateWindowsPrinters(): Promise<WindowsPrinterRecord[]> {
  return new Promise((resolve) => {
    const script = `
      $rows = @()
      try {
        $rows = @(Get-Printer -ErrorAction Stop |
          Select-Object Name, DriverName, PortName, Default)
      } catch {}

      # Some Windows environments deny PrintManagement/CIM access to the app,
      # and others return only a partial queue list. The printer queue registry
      # still exposes every installed queue name and port, so always merge it.
      $registryRows = @(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers\\*' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -and $_.Port } |
        Select-Object @{Name='Name';Expression={$_.PSChildName}}, @{Name='DriverName';Expression={$_.Driver}}, @{Name='PortName';Expression={$_.Port}}, @{Name='Default';Expression={$false}})

      @($rows) + @($registryRows) | ConvertTo-Json -Compress
    `;
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';
    const timer = setTimeout(() => {
      ps.kill();
      resolve([]);
    }, 8000);

    ps.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    ps.on('close', () => {
      clearTimeout(timer);
      // The same queue can appear twice (Get-Printer and the registry): merge by name.
      const byName = new Map<string, WindowsPrinterRecord>();
      for (const row of parseQueueRows(output)) {
        const key = row.name.toLowerCase();
        const existing = byName.get(key);
        byName.set(key, {
          name: row.name,
          displayName: row.name,
          driverName: row.driverName || existing?.driverName || '',
          portName: row.portName || existing?.portName || '',
          isDefault: row.isDefault || existing?.isDefault === true,
        });
      }
      resolve([...byName.values()]);
    });
    ps.on('error', () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}

export async function inspectWindowsPrinter(deviceName: string, profile: PrinterProfile): Promise<PrinterCapabilities> {
  // 1. Check for bundled or local native helper
  const candidatePaths = [
    path.join(process.resourcesPath || '', 'native-bin', 'inspect_printer.exe'),
    path.join(app.getAppPath(), 'native-bin', 'win32', 'inspect_printer.exe'),
    path.resolve('native-bin', 'win32', 'inspect_printer.exe'),
  ];

  const helperPath = candidatePaths.find((p) => fs.existsSync(p));

  if (helperPath) {
    try {
      const result = await runNativeHelper(helperPath, deviceName);
      if (result) return result;
    } catch (err) {
      console.warn('Native inspection helper failed, falling back to OS query:', err);
    }
  }

  // 2. Fallback using PowerShell Get-Printer / WMI query
  return queryPrinterViaPowerShell(deviceName, profile);
}

function runNativeHelper(helperPath: string, deviceName: string): Promise<PrinterCapabilities | null> {
  return new Promise((resolve) => {
    const proc = spawn(helperPath, [deviceName], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    const timeout = setTimeout(() => {
      proc.kill();
      resolve(null);
    }, 10000);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code === 0 ? parseHelperOutput(stdout) : null);
    });

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

function queryPrinterViaPowerShell(deviceName: string, profile: PrinterProfile): Promise<PrinterCapabilities> {
  return new Promise((resolve) => {
    // The queue name reaches the script through an environment variable, never
    // through the script text: PowerShell treats typographic quotes as string
    // delimiters too, so escaping quotes in the name is not enough.
    const script = `
      try {
        $p = Get-Printer -Name $env:LABELMAKER_QUEUE_NAME -ErrorAction Stop
        $transport = 'unknown'
        if ($p.PortName -match 'USB') { $transport = 'usb' }
        elseif ($p.PortName -match 'BTH|Bluetooth') { $transport = 'bluetooth' }
        elseif ($p.PortName -match 'IP_|WSD|TCP') { $transport = 'network' }
        
        $status = 'ready'
        if ($p.PrinterStatus -match 'Offline') { $status = 'offline' }
        elseif ($p.PrinterStatus -match 'Paused') { $status = 'paused' }
        elseif ($p.PrinterStatus -match 'Error') { $status = 'error' }

        [PSCustomObject]@{
          Port = $p.PortName
          Driver = $p.DriverName
          Status = $status
          Transport = $transport
        } | ConvertTo-Json -Compress
      } catch {
        [PSCustomObject]@{ error = $_.Exception.Message } | ConvertTo-Json -Compress
      }
    `;

    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      env: { ...process.env, LABELMAKER_QUEUE_NAME: deviceName },
    });

    let out = '';
    const timer = setTimeout(() => {
      ps.kill();
      resolve(createDefaultCapabilities(deviceName, profile));
    }, 8000);

    ps.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });

    ps.on('close', () => {
      clearTimeout(timer);
      const queue = parsePowerShellQueue(out);
      if (!queue) {
        resolve(createDefaultCapabilities(deviceName, profile));
        return;
      }

      resolve({
        status: queue.status,
        transport: queue.transport === 'unknown' ? detectTransport(queue.port, deviceName) : queue.transport,
        // Windows was not asked for the media here, so these are the profile's expected values.
        paperDimensionsMm: profile === '4x6'
          ? { width: 101.6, height: 152.4 }
          : { width: SP310_OUTPUT_WIDTH_IN * 25.4, height: SP310_OUTPUT_HEIGHT_IN * 25.4 },
        hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
        resolutionDpi: { x: 203, y: 203 },
      });
    });

    ps.on('error', () => {
      clearTimeout(timer);
      resolve(createDefaultCapabilities(deviceName, profile));
    });
  });
}

function createDefaultCapabilities(deviceName: string, profile: PrinterProfile): PrinterCapabilities {
  return {
    // The inspection failed or timed out, so the real state is not known.
    status: 'unknown',
    transport: detectTransport('', deviceName),
    paperDimensionsMm: profile === '4x6'
      ? { width: 101.6, height: 152.4 }
      : { width: SP310_OUTPUT_WIDTH_IN * 25.4, height: SP310_OUTPUT_HEIGHT_IN * 25.4 },
    hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
    resolutionDpi: { x: 203, y: 203 },
  };
}
