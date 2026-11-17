import type { NormalizedQueue, PrinterProfile, QueueStatus, TransportType } from '@shared/contracts';

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

/** Classifies supported iDPRT queues without treating model prefixes as matches. */
export function identifyPrinterProfile(name: string, driver = '', model = ''): PrinterProfile | null {
  const normName = normalizePrinterName(name);
  const normDriver = normalizePrinterName(driver);
  const normModel = normalizePrinterName(model);

  const combined = `${normName} ${normDriver} ${normModel}`;

  const hasSp410 = /sp410(?!\d)/.test(combined);
  const hasSp310 = /sp310(?!\d)/.test(combined);

  // Ambiguous metadata must never be routed to either profile.
  if (hasSp410 === hasSp310) return null;
  if (hasSp410) return '4x6';
  if (hasSp310) return '2x1';
  return null;
}

export function isSp410Eligible(name: string, driver = '', model = ''): boolean {
  return identifyPrinterProfile(name, driver, model) === '4x6';
}

export function isSp310Eligible(name: string, driver = '', model = ''): boolean {
  return identifyPrinterProfile(name, driver, model) === '2x1';
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
