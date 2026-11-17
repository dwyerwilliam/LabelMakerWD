import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { PrinterCapabilities } from './printerAdapter';
import { detectTransport } from './printerAdapter';
import type { PrinterProfile } from '@shared/contracts';
import { SP310_OUTPUT_HEIGHT_IN, SP310_OUTPUT_WIDTH_IN } from '@shared/defaults';

export async function inspectMacosPrinter(deviceName: string, profile: PrinterProfile): Promise<PrinterCapabilities> {
  const candidatePaths = [
    path.join(process.resourcesPath || '', 'native-bin', 'inspect_printer'),
    path.join(app.getAppPath(), 'native-bin', 'darwin', 'inspect_printer'),
    path.resolve('native-bin', 'darwin', 'inspect_printer'),
  ];

  const helperPath = candidatePaths.find((p) => fs.existsSync(p));

  if (helperPath) {
    try {
      const result = await runMacHelper(helperPath, deviceName, profile);
      if (result) return result;
    } catch {}
  }

  const dimensions = profile === '4x6'
    ? { width: 101.6, height: 152.4 }
    : { width: SP310_OUTPUT_WIDTH_IN * 25.4, height: SP310_OUTPUT_HEIGHT_IN * 25.4 };

  return {
    status: 'ready',
    transport: detectTransport('', deviceName),
    paperDimensionsMm: dimensions,
    hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
    resolutionDpi: { x: 203, y: 203 },
  };
}

function runMacHelper(helperPath: string, deviceName: string, profile: PrinterProfile): Promise<PrinterCapabilities | null> {
  return new Promise((resolve) => {
    const proc = spawn(helperPath, [deviceName, profile]);
    let stdout = '';

    const timeout = setTimeout(() => {
      proc.kill();
      resolve(null);
    }, 8000);

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
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
