export const IPC_CHANNELS = {
  PREFERENCES_GET: 'preferences:get',
  PREFERENCES_UPDATE: 'preferences:update',
  PREFERENCES_RESET: 'preferences:reset',

  PRINTERS_SCAN: 'printers:scan',
  PRINTERS_SELECT: 'printers:select',

  PRINT_PREPARE: 'print:prepare',
  PRINT_CONFIRM: 'print:confirm',
  PRINT_CANCEL: 'print:cancel',
  PRINT_STATUS: 'print:status',
  PRINT_STATE_EVENT: 'print:state-event',

  // Hidden print window internal communication
  PRINT_WINDOW_JOB: 'print-window:job',
  PRINT_WINDOW_READY: 'print-window:ready',
  PRINT_WINDOW_SUBMIT: 'print-window:submit',

  APP_REQUEST_CLOSE: 'app:request-close',
} as const;
