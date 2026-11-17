export type AppErrorCode =
  | 'INVALID_INPUT'
  | 'PRINTER_NOT_FOUND'
  | 'PRINTER_INSPECTION_FAILED'
  | 'UNSUPPORTED_MEDIA'
  | 'UNPRINTABLE_AREA'
  | 'FONT_UNAVAILABLE'
  | 'LAYOUT_MISMATCH'
  | 'SETTINGS_READ_FAILED'
  | 'SETTINGS_WRITE_FAILED'
  | 'PRINT_PREPARATION_FAILED'
  | 'PRINT_SUBMISSION_FAILED'
  | 'PRINT_OUTCOME_UNCERTAIN'
  | 'REQUEST_BUSY'
  | 'UNSUPPORTED_PLATFORM';

export interface AppError {
  code: AppErrorCode;
  message: string;
  detail?: string;
  actionHint?: string;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export function makeError(code: AppErrorCode, message: string, detail?: string, actionHint?: string): AppError {
  return { code, message, detail, actionHint };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(code: AppErrorCode, message: string, detail?: string, actionHint?: string): Result<T> {
  return { ok: false, error: makeError(code, message, detail, actionHint) };
}
