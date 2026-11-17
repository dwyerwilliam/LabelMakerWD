import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/channels';
import { isTrustedSender, validateIpcSender } from './trustedSender';
import {
  preferencesUpdateSchema,
  selectPrinterPayloadSchema,
  preparePrintPayloadSchema,
  confirmPrintPayloadSchema,
  cancelPrintPayloadSchema,
  printStatusPayloadSchema,
  printWindowReadyPayloadSchema,
  labelHasTextSchema,
} from '@shared/schemas';
import type { SettingsService } from '../services/settingsService';
import type { PrinterService } from '../services/printerService';
import type { PrintService } from '../services/printService';
import type { LifecycleService } from '../services/lifecycleService';

export function registerIpcHandlers(
  settingsService: SettingsService,
  printerService: PrinterService,
  printService: PrintService,
  lifecycleService: LifecycleService
): void {
  // Preferences
  ipcMain.handle(IPC_CHANNELS.PREFERENCES_GET, (event) => {
    validateIpcSender(event);
    return settingsService.getPreferences();
  });

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_UPDATE, async (event, partial) => {
    validateIpcSender(event);
    const parsed = preferencesUpdateSchema.parse(partial);
    await settingsService.update(parsed);
  });

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_RESET, async (event) => {
    validateIpcSender(event);
    return settingsService.reset();
  });

  // Printers
  ipcMain.handle(IPC_CHANNELS.PRINTERS_SCAN, async (event) => {
    console.log('[IPC] printers:scan invoked');
    validateIpcSender(event);
    return printerService.scan();
  });

  ipcMain.handle(IPC_CHANNELS.PRINTERS_SELECT, async (event, payload) => {
    validateIpcSender(event);
    const { profile, deviceName, manualConfirm } = selectPrinterPayloadSchema.parse(payload);
    return printerService.selectQueue(profile, deviceName, manualConfirm ?? false);
  });

  // Printing
  ipcMain.handle(IPC_CHANNELS.PRINT_PREPARE, async (event, payload) => {
    validateIpcSender(event);
    const { snapshot } = preparePrintPayloadSchema.parse(payload);
    return printService.prepare(snapshot);
  });

  ipcMain.handle(IPC_CHANNELS.PRINT_CONFIRM, async (event, payload) => {
    validateIpcSender(event);
    const { token, requestId } = confirmPrintPayloadSchema.parse(payload);
    return printService.confirm(token, requestId);
  });

  ipcMain.handle(IPC_CHANNELS.PRINT_CANCEL, (event, payload) => {
    validateIpcSender(event);
    const { token } = cancelPrintPayloadSchema.parse(payload);
    printService.cancel(token);
  });

  ipcMain.handle(IPC_CHANNELS.PRINT_STATUS, (event, payload) => {
    validateIpcSender(event);
    const { requestId } = printStatusPayloadSchema.parse(payload);
    return printService.getStatus(requestId);
  });

  // The hidden print window says it is ready to receive jobs.
  ipcMain.on(IPC_CHANNELS.PRINT_WINDOW_LISTENING, (event) => {
    if (!isTrustedSender(event, 'print')) return;
    printService.handlePrintWindowListening();
  });

  // The hidden print window reports its measured layout. Only that window may,
  // and a malformed report is ignored (the preparation then times out).
  ipcMain.on(IPC_CHANNELS.PRINT_WINDOW_READY, (event, payload) => {
    if (!isTrustedSender(event, 'print')) return;
    const parsed = printWindowReadyPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    printService.handlePrintWindowReady(parsed.data.requestId, parsed.data.fingerprint);
  });

  // App lifecycle
  ipcMain.handle(IPC_CHANNELS.APP_GET_LAUNCH_INFO, (event) => {
    validateIpcSender(event);
    return { firstLaunch: settingsService.isFreshInstall(), settingsProblem: settingsService.getLoadProblem() };
  });

  ipcMain.handle(IPC_CHANNELS.APP_SET_LABEL_HAS_TEXT, (event, hasText) => {
    validateIpcSender(event);
    lifecycleService.setLabelHasText(labelHasTextSchema.parse(hasText));
  });
}
