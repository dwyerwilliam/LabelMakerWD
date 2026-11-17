import { describe, it, expect } from 'vitest';
import { parseHelperOutput, parsePowerShellQueue, parseQueueRows } from '@main/platform/helperOutput';

describe('parseHelperOutput', () => {
  it('reads what the real helper prints for a queue', () => {
    const output =
      '{"version":1,"status":"ready","transport":"usb","port":"USB002","driver":"iDPRT SP310",' +
      '"paperDimensionsMm":{"width":76.2,"height":127},"hardMarginsMm":{"left":0,"top":0,"right":0,"bottom":0},' +
      '"resolutionDpi":{"x":203,"y":203}}\n';

    expect(parseHelperOutput(output)).toEqual({
      status: 'ready',
      transport: 'usb',
      paperDimensionsMm: { width: 76.2, height: 127 },
      hardMarginsMm: { left: 0, top: 0, right: 0, bottom: 0 },
      resolutionDpi: { x: 203, y: 203 },
    });
  });

  it('treats an error report, empty output and garbage as "no answer"', () => {
    expect(parseHelperOutput('{"error":"OpenPrinter failed","code":1801}')).toBeNull();
    expect(parseHelperOutput('')).toBeNull();
    expect(parseHelperOutput('not json')).toBeNull();
    expect(parseHelperOutput('[1,2,3]')).toBeNull();
    expect(parseHelperOutput('{"paperDimensionsMm":{"width":"wide"}}')).toBeNull();
  });

  it('turns an unknown status or transport into "unknown" instead of trusting it', () => {
    const parsed = parseHelperOutput('{"status":"exploding","transport":"carrier-pigeon"}');
    expect(parsed).toMatchObject({ status: 'unknown', transport: 'unknown' });
  });

  it('reports ready when the helper sets no problem flag, and unknown transport when it gives none', () => {
    expect(parseHelperOutput('{}')).toMatchObject({ status: 'ready', transport: 'unknown' });
  });
});

describe('parsePowerShellQueue', () => {
  it('reads the per-queue query', () => {
    expect(parsePowerShellQueue('{"Port":"USB001","Driver":"iDPRT SP410BT","Status":"offline","Transport":"usb"}')).toEqual({
      port: 'USB001',
      driver: 'iDPRT SP410BT',
      status: 'offline',
      transport: 'usb',
    });
  });

  it('returns null for an error report or nonsense', () => {
    expect(parsePowerShellQueue('{"error":"No MSFT_Printer objects found"}')).toBeNull();
    expect(parsePowerShellQueue('')).toBeNull();
    expect(parsePowerShellQueue('<html>')).toBeNull();
  });

  it('copes with missing fields', () => {
    expect(parsePowerShellQueue('{"Port":null}')).toEqual({ port: '', driver: '', status: 'ready', transport: 'unknown' });
  });
});

describe('parseQueueRows', () => {
  it('reads an array, a single object, and nothing', () => {
    const row = '{"Name":"iDPRT SP410BT","DriverName":"iDPRT SP410BT","PortName":"USB001","Default":false}';
    expect(parseQueueRows(`[${row},${row.replace('SP410BT', 'SP310')}]`).map((r) => r.name)).toEqual(['iDPRT SP410BT', 'iDPRT SP310']);
    expect(parseQueueRows(row)).toEqual([{ name: 'iDPRT SP410BT', driverName: 'iDPRT SP410BT', portName: 'USB001', isDefault: false }]);
    expect(parseQueueRows('')).toEqual([]);
    expect(parseQueueRows('   \n')).toEqual([]);
  });

  it('skips rows that are not queues and tolerates null fields', () => {
    const rows = parseQueueRows('[{"Name":"A","DriverName":null,"PortName":null,"Default":null},{"Name":5},null,"x",{"foo":1}]');
    expect(rows).toEqual([{ name: 'A', driverName: '', portName: '', isDefault: false }]);
  });

  it('returns nothing for text that is not JSON', () => {
    expect(parseQueueRows('Get-Printer : access denied')).toEqual([]);
  });
});
