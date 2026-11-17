import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { PrinterCapabilities } from './printerAdapter';
import { detectTransport } from './printerAdapter';
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

    ps.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    ps.on('close', () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(output.trim() || '[]');
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const byName = new Map<string, WindowsPrinterRecord>();
        for (const row of rows) {
          if (!row || typeof row.Name !== 'string') continue;
          const key = row.Name.toLowerCase();
          const existing = byName.get(key);
          byName.set(key, {
            name: row.Name,
            displayName: row.Name,
            driverName: row.DriverName || existing?.driverName || '',
            portName: row.PortName || existing?.portName || '',
            isDefault: row.Default === true || existing?.isDefault === true,
          });
        }
        resolve([...byName.values()]);
      } catch {
        resolve([]);
      }
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

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && stdout.trim()) {
        try {
          const json = JSON.parse(stdout.trim());
          if (json && !json.error) {
            resolve({
              status: json.status || 'ready',
              transport: json.transport || 'unknown',
              paperDimensionsMm: json.paperDimensionsMm,
              hardMarginsMm: json.hardMarginsMm,
              resolutionDpi: json.resolutionDpi,
            });
            return;
          }
        } catch {}
      }
      resolve(null);
    });

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

function queryPrinterViaPowerShell(deviceName: string, profile: PrinterProfile): Promise<PrinterCapabilities> {
  return new Promise((resolve) => {
    // Escape single quotes for PowerShell
    const escapedName = deviceName.replace(/'/g, "''");
    const script = `
      try {
        $p = Get-Printer -Name '${escapedName}' -ErrorAction Stop
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
        '{"error":"' + $_.Exception.Message + '"}'
      }
    `;

    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    });

    let out = '';
    const timer = setTimeout(() => {
      ps.kill();
      resolve(createDefaultCapabilities(deviceName, profile));
    }, 8000);

    ps.stdout.on('data', (d) => {
      out += d.toString();
    });

    ps.on('close', () => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(out.trim());
        if (data && !data.error) {
          resolve({
            status: data.Status || 'ready',
            transport: data.Transport || detectTransport(data.Port, deviceName),
            paperDimensionsMm: profile === '4x6'
              ? { width: 101.6, height: 152.4 }
              : { width: SP310_OUTPUT_WIDTH_IN * 25.4, height: SP310_OUTPUT_HEIGHT_IN * 25.4 },
            hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
            resolutionDpi: { x: 203, y: 203 },
          });
          return;
        }
      } catch {}

      resolve(createDefaultCapabilities(deviceName, profile));
    });

    ps.on('error', () => {
      clearTimeout(timer);
      resolve(createDefaultCapabilities(deviceName, profile));
    });
  });
}

function createDefaultCapabilities(deviceName: string, profile: PrinterProfile): PrinterCapabilities {
  return {
    status: 'ready',
    transport: detectTransport('', deviceName),
    paperDimensionsMm: profile === '4x6'
      ? { width: 101.6, height: 152.4 }
      : { width: SP310_OUTPUT_WIDTH_IN * 25.4, height: SP310_OUTPUT_HEIGHT_IN * 25.4 },
    hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
    resolutionDpi: { x: 203, y: 203 },
  };
}
