import { describe, it, expect } from 'vitest';
import { identifyPrinterProfile, isSp310Eligible, isSp410Eligible, detectTransport } from '@main/platform/printerAdapter';

describe('Printer Matching and Eligibility', () => {
  it('matches SP410 and SP410BT queues in different casings and formats', () => {
    expect(isSp410Eligible('iDPRT SP410BT')).toBe(true);
    expect(isSp410Eligible('idprt sp410')).toBe(true);
    expect(isSp410Eligible('SP410BT')).toBe(true);
    expect(isSp410Eligible('sp-410-bt')).toBe(true);
    expect(isSp410Eligible('sp_410')).toBe(true);
    expect(isSp410Eligible('Printer_SP410BT_USB')).toBe(true);
  });

  it('rejects SP310 models explicitly', () => {
    expect(isSp410Eligible('iDPRT SP310')).toBe(false);
    expect(isSp410Eligible('SP310BT')).toBe(false);
    expect(isSp410Eligible('sp-310')).toBe(false);
    expect(isSp410Eligible('SP410-SP310')).toBe(false); // contains sp310
  });

  it('rejects unrelated models such as SP4100', () => {
    expect(isSp410Eligible('SP4100')).toBe(false);
    expect(isSp410Eligible('iDPRT SP4100')).toBe(false);
    expect(isSp410Eligible('SP4102')).toBe(false);
  });

  it('matches the SP310 to the 2x1 profile and rejects numbered variants', () => {
    expect(isSp310Eligible('iDPRT SP310')).toBe(true);
    expect(isSp310Eligible('SP-310')).toBe(true);
    expect(identifyPrinterProfile('iDPRT SP310', '', 'SP310')).toBe('2x1');
    expect(isSp310Eligible('SP3100')).toBe(false);
    expect(identifyPrinterProfile('SP410-SP310')).toBe(null);
  });

  it('detects USB vs Bluetooth vs Network transports correctly', () => {
    expect(detectTransport('USB001', 'SP410BT')).toBe('usb');
    expect(detectTransport('BTH01', 'SP410BT')).toBe('bluetooth');
    expect(detectTransport('IP_192.168.1.50', 'SP410')).toBe('network');
    expect(detectTransport('WSD-1234', 'SP410')).toBe('network');
    expect(detectTransport('LPT1', 'SP410')).toBe('unknown');
  });
});
