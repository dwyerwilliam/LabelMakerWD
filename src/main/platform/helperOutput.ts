import { z } from 'zod';
import type { PrinterCapabilities } from './printerAdapter';

/**
 * Parsers for what the native inspection helpers, PowerShell and the queue
 * registry print. All of it is data from outside the app, so it is validated
 * rather than trusted: anything unexpected is treated as "not known".
 */

const dimensions = z.object({ width: z.number(), height: z.number() });
const margins = z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() });
const resolution = z.object({ x: z.number(), y: z.number() });

const status = z.enum(['ready', 'offline', 'paused', 'error', 'unknown']).catch('unknown');
const transport = z.enum(['usb', 'bluetooth', 'network', 'unknown']).catch('unknown');

const helperSchema = z.object({
  error: z.unknown().optional(),
  status: status.optional(),
  transport: transport.optional(),
  paperDimensionsMm: dimensions.optional(),
  hardMarginsMm: margins.optional(),
  resolutionDpi: resolution.optional(),
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return undefined;
  }
}

/** The JSON printed by `inspect_printer` (Windows and macOS). Null if it reported an error or printed nonsense. */
export function parseHelperOutput(stdout: string): PrinterCapabilities | null {
  const parsed = helperSchema.safeParse(parseJson(stdout));
  if (!parsed.success || parsed.data.error !== undefined) return null;

  const { status: queueStatus, transport: queueTransport, paperDimensionsMm, hardMarginsMm, resolutionDpi } = parsed.data;
  return {
    // The helper only omits the status when no problem flag was set.
    status: queueStatus ?? 'ready',
    transport: queueTransport ?? 'unknown',
    paperDimensionsMm,
    hardMarginsMm,
    resolutionDpi,
  };
}

const powerShellQueueSchema = z.object({
  error: z.unknown().optional(),
  Port: z.string().nullish(),
  Driver: z.string().nullish(),
  Status: status.optional(),
  Transport: transport.optional(),
});

export interface PowerShellQueueInfo {
  port: string;
  driver: string;
  status: PrinterCapabilities['status'];
  transport: PrinterCapabilities['transport'];
}

/** What the per-queue PowerShell query printed. Null if it failed. */
export function parsePowerShellQueue(stdout: string): PowerShellQueueInfo | null {
  const parsed = powerShellQueueSchema.safeParse(parseJson(stdout));
  if (!parsed.success || parsed.data.error !== undefined) return null;

  return {
    port: parsed.data.Port ?? '',
    driver: parsed.data.Driver ?? '',
    status: parsed.data.Status ?? 'ready',
    transport: parsed.data.Transport ?? 'unknown',
  };
}

const queueRowSchema = z.object({
  Name: z.string(),
  DriverName: z.string().nullish(),
  PortName: z.string().nullish(),
  Default: z.boolean().nullish(),
});

export interface WindowsQueueRow {
  name: string;
  driverName: string;
  portName: string;
  isDefault: boolean;
}

/** The queue list printed by the enumeration script: one object, an array, or nothing. Invalid rows are skipped. */
export function parseQueueRows(stdout: string): WindowsQueueRow[] {
  const data = parseJson(stdout.trim() === '' ? '[]' : stdout);
  const rows = Array.isArray(data) ? data : data === undefined ? [] : [data];

  const result: WindowsQueueRow[] = [];
  for (const row of rows) {
    const parsed = queueRowSchema.safeParse(row);
    if (!parsed.success) continue;
    result.push({
      name: parsed.data.Name,
      driverName: parsed.data.DriverName ?? '',
      portName: parsed.data.PortName ?? '',
      isDefault: parsed.data.Default === true,
    });
  }
  return result;
}
