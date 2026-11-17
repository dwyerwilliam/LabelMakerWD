import type { NormalizedQueue, QueueStatus, TransportType } from '@shared/contracts';

export interface PrinterCapabilities {
  paperDimensionsMm?: { width: number; height: number };
  hardMarginsMm?: { left: number; top: number; right: number; bottom: number };
  resolutionDpi?: { x: number; y: number };
  transport: TransportType;
  status: QueueStatus;
}

export function normalizePrinterName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_]/g, '');
}

/**
 * Checks whether the printer identity corresponds to an iDPRT SP410 / SP410BT.
 * Matches:
 *  - 'sp410'
 *  - 'sp410bt'
 *  - 'idprtsp410'
 *  - 'idprtsp410bt'
 * Excludes:
 *  - 'sp310'
 *  - 'sp4100' or other numbers following sp410
 */
export function isSp410Eligible(name: string, driver = '', model = ''): boolean {
  const normName = normalizePrinterName(name);
  const normDriver = normalizePrinterName(driver);
  const normModel = normalizePrinterName(model);

  const combined = `${normName} ${normDriver} ${normModel}`;

  // Explicitly exclude SP310
  if (combined.includes('sp310')) {
    return false;
  }

  // Check for sp410 followed by other digits (e.g. sp4100)
  if (/sp410\d/.test(combined)) {
    return false;
  }

  // Must contain sp410
  if (combined.includes('sp410')) {
    return true;
  }

  return false;
}

export function detectTransport(portName = '', deviceName = ''): TransportType {
  const normPort = portName.toLowerCase();
  const normName = deviceName.toLowerCase();

  if (normPort.includes('usb') || normName.includes('usb')) {
    return 'usb';
  }
  if (normPort.includes('bth') || normPort.includes('bluetooth') || normName.includes('bluetooth')) {
    return 'bluetooth';
  }
  if (normPort.includes('ip_') || normPort.includes('tcp') || normPort.includes('http') || normPort.includes('wsd')) {
    return 'network';
  }

  return 'unknown';
}
