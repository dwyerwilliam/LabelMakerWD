import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/channels';
import { validateIpcSender } from './trustedSender';
import {
  preferencesUpdateSchema,
  printerProfileSchema,
  preparePrintPayloadSchema,
  confirmPrintPayloadSchema,
} from '@shared/schemas';
import type { SettingsService } from '../services/settingsService';
import type { PrinterService } from '../services/printerService';
import type { PrintService } from '../services/printService';

export function registerIpcHandlers(
  settingsService: SettingsService,
  printerService: PrinterService,
  printService: PrintService
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

  ipcMain.handle(IPC_CHANNELS.PRINTERS_SELECT, async (event, { profile, deviceName, manualConfirm }) => {
    validateIpcSender(event);
    const parsedProfile = printerProfileSchema.parse(profile);
    return printerService.selectQueue(parsedProfile, deviceName, manualConfirm);
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

  ipcMain.handle(IPC_CHANNELS.PRINT_CANCEL, (event, { token }) => {
    validateIpcSender(event);
    printService.cancel(token);
  });

  ipcMain.handle(IPC_CHANNELS.PRINT_STATUS, (event, { requestId }) => {
    validateIpcSender(event);
    return printService.getStatus(requestId);
  });

  // Hidden print window ready report
  ipcMain.on(IPC_CHANNELS.PRINT_WINDOW_READY, (event, { requestId, fingerprint }) => {
    printService.handlePrintWindowReady(requestId, fingerprint);
  });

  // App lifecycle
  ipcMain.handle(IPC_CHANNELS.APP_REQUEST_CLOSE, async (event) => {
    validateIpcSender(event);
    await settingsService.flush();
    return true;
  });
}
