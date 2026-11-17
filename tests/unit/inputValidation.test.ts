import { describe, it, expect } from 'vitest';
import { parseCopiesInput, parseFontSizeInput } from '@shared/inputValidation';

describe('parseFontSizeInput', () => {
  it('accepts sizes from 6 to 288 pt in half-point steps, exactly as typed', () => {
    for (const [raw, value] of [['6', 6], ['24', 24], ['12.5', 12.5], ['72.0', 72], [' 288 ', 288], ['.5e1', undefined]] as const) {
      const result = parseFontSizeInput(raw);
      if (value === undefined) expect(result.ok).toBe(false);
      else expect(result).toEqual({ ok: true, value });
    }
  });

  it('rejects blank, non-numeric, out-of-range and off-step values instead of correcting them', () => {
    for (const raw of ['', '   ', 'abc', '12pt', '5', '5.5', '288.5', '300', '-12', '24.3', '24.25', '1e2', 'Infinity', 'NaN']) {
      const result = parseFontSizeInput(raw);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) expect(result.message).toContain('6–288 pt');
    }
  });
});

describe('parseCopiesInput', () => {
  it('accepts whole numbers from 1 to 99', () => {
    for (const [raw, value] of [['1', 1], ['3', 3], ['99', 99], [' 10 ', 10]] as const) {
      expect(parseCopiesInput(raw)).toEqual({ ok: true, value });
    }
  });

  it('rejects blank, fractional, out-of-range and non-numeric values', () => {
    for (const raw of ['', '0', '100', '-1', '2.5', '1e1', 'abc', '3 copies']) {
      expect(parseCopiesInput(raw).ok, raw).toBe(false);
    }
  });
});
