import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { PrinterCapabilities } from './printerAdapter';
import { detectTransport } from './printerAdapter';

export async function inspectWindowsPrinter(deviceName: string): Promise<PrinterCapabilities> {
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
  return queryPrinterViaPowerShell(deviceName);
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

function queryPrinterViaPowerShell(deviceName: string): Promise<PrinterCapabilities> {
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
      resolve(createDefaultCapabilities(deviceName));
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
            paperDimensionsMm: { width: 101.6, height: 152.4 },
            hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
            resolutionDpi: { x: 203, y: 203 },
          });
          return;
        }
      } catch {}

      resolve(createDefaultCapabilities(deviceName));
    });

    ps.on('error', () => {
      clearTimeout(timer);
      resolve(createDefaultCapabilities(deviceName));
    });
  });
}

function createDefaultCapabilities(deviceName: string): PrinterCapabilities {
  return {
    status: 'ready',
    transport: detectTransport('', deviceName),
    paperDimensionsMm: { width: 101.6, height: 152.4 },
    hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
    resolutionDpi: { x: 203, y: 203 },
  };
}
