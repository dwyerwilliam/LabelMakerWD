import type { PrinterProfile, QueueStatus, TransportType } from '@shared/contracts';

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

/** Connection type for the scheme of a CUPS device URI (macOS), or null when it is not one we know. */
function transportFromUriScheme(uri: string): TransportType | null {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(uri)?.[1];
  if (!scheme) return null;
  if (scheme === 'usb') return 'usb';
  if (scheme === 'bluetooth' || scheme === 'bt' || scheme === 'btspp') return 'bluetooth';
  if (/^(ipps?|ipp14|http|https|socket|lpd|dnssd|mdns|smb|ncp)$/.test(scheme)) return 'network';
  return null;
}

/**
 * Works out how a queue is connected from its port name (Windows: USB001, IP_10.0.0.9,
 * WSD-…) or its device URI (macOS CUPS: usb://…, ipp://…, socket://…).
 */
export function detectTransport(portName = '', deviceName = ''): TransportType {
  const normPort = portName.toLowerCase();
  const normName = deviceName.toLowerCase();

  // A URI states the connection outright; the host name inside it ("usb-hub.local") must not be mistaken for a port type.
  const fromUri = transportFromUriScheme(normPort);
  if (fromUri) return fromUri;

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
