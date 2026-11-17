import { FONT_SIZE_STEP_PT, MAX_COPIES, MAX_FONT_SIZE_PT, MIN_COPIES, MIN_FONT_SIZE_PT } from './defaults';

export type FieldResult = { ok: true; value: number } | { ok: false; message: string };

const DECIMAL = /^(\d+(\.\d*)?|\.\d+)$/;
const WHOLE_NUMBER = /^\d+$/;

export const FONT_SIZE_ERROR = `Font size must be ${MIN_FONT_SIZE_PT}–${MAX_FONT_SIZE_PT} pt in ${FONT_SIZE_STEP_PT} pt steps.`;
export const COPIES_ERROR = `Copies must be a whole number from ${MIN_COPIES} to ${MAX_COPIES}.`;

/**
 * Parses the text of the font size field. Nothing is rounded or clamped: a
 * value that is not exactly representable (24.3, 5, 300, "abc", blank) is an
 * error the user has to fix, so the label never prints at a size they did not choose.
 */
export function parseFontSizeInput(raw: string): FieldResult {
  const text = raw.trim();
  if (!DECIMAL.test(text)) return { ok: false, message: FONT_SIZE_ERROR };

  const value = Number(text);
  const onStep = Math.abs(value / FONT_SIZE_STEP_PT - Math.round(value / FONT_SIZE_STEP_PT)) < 1e-9;
  if (!Number.isFinite(value) || value < MIN_FONT_SIZE_PT || value > MAX_FONT_SIZE_PT || !onStep) {
    return { ok: false, message: FONT_SIZE_ERROR };
  }
  return { ok: true, value };
}

/** Parses the text of the copies field: a whole number from 1 to 99. */
export function parseCopiesInput(raw: string): FieldResult {
  const text = raw.trim();
  if (!WHOLE_NUMBER.test(text)) return { ok: false, message: COPIES_ERROR };

  const value = Number(text);
  if (value < MIN_COPIES || value > MAX_COPIES) return { ok: false, message: COPIES_ERROR };
  return { ok: true, value };
}
