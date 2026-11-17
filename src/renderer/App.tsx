import React, { useEffect, useState, useCallback } from 'react';
import { Toolbar } from './components/Toolbar';
import { LabelEditor } from './components/LabelEditor';
import { PrinterStatus } from './components/PrinterStatus';
import { SettingsDialog } from './components/SettingsDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useLabelStore } from './stores/labelStore';
import { useDeviceStore } from './stores/deviceStore';
import { usePreferencesStore } from './stores/preferencesStore';
import { useUIStore } from './stores/uiStore';
import type { PrintPrepareResult, PrintSnapshot } from '@shared/contracts';
import { queueIdentityFingerprint } from '@shared/printerSelection';

export const App: React.FC = () => {
  const { activeProfile, draft, layoutFingerprint, layoutFingerprintRevision, hydratePreferences } =
    useLabelStore();
  const { setQueues, setScanning, setError, selectedQueues, selectQueue } = useDeviceStore();
  const { hydrate, reset: resetPrefs, update: updatePreferences } = usePreferencesStore();
  const {
    activeDialog,
    openDialog,
    closeDialog,
    isPrintBusy,
    setPrintBusy,
  } = useUIStore();

  const [pendingPrepareResult, setPendingPrepareResult] = useState<PrintPrepareResult | null>(null);

  // Main asks before closing a window that still holds label text, so it only
  // needs to know whether there is any (the text itself stays in the renderer).
  const labelHasText = draft.text.trim().length > 0;
  useEffect(() => {
    if (!window.api) return;
    void window.api.app.setLabelHasText(labelHasText).catch((err: unknown) => {
      console.warn('Could not report label state to main:', err);
    });
  }, [labelHasText]);

  // Scan printers
  const handleScanPrinters = useCallback(async () => {
    if (!window.api) return;
    try {
      setScanning(true);
      setError(null);
      const queues = await window.api.printers.scan();
      setQueues(queues, usePreferencesStore.getState().preferences);
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(err?.message || 'Failed scanning printers');
    } finally {
      setScanning(false);
    }
  }, [setError, setQueues, setScanning]);

  // Initial load: hydrate preferences and scan queues
  useEffect(() => {
    async function init() {
      if (!window.api) return;

      try {
        const saved = await window.api.preferences.get();
        if (saved) {
          hydrate(saved);
          hydratePreferences(saved);
        }
      } catch (err) {
        console.warn('Failed hydrating preferences:', err);
      }

      await handleScanPrinters();
    }

    init();
  }, [handleScanPrinters, hydrate, hydratePreferences]);

  // Subscribe to print state events from main
  useEffect(() => {
    if (!window.api) return;

    const unsubscribe = window.api.print.onStateEvent((evt) => {
      if (evt.state === 'submitting') {
        setPrintBusy(true, 'Sending to printer…');
      } else if (evt.state === 'submitted') {
        setPrintBusy(false, evt.detail || 'Sent to printer queue');
        setTimeout(() => setPrintBusy(false, ''), 5000);
      } else if (evt.state === 'failed') {
        setPrintBusy(false, `Print failed: ${evt.detail || 'Unknown error'}`);
        setTimeout(() => setPrintBusy(false, ''), 6000);
      }
    });

    return unsubscribe;
  }, [setPrintBusy]);

  // Handle print flow
  const executeConfirmedPrint = useCallback(async (token: string, requestId: string) => {
    if (!window.api) return;
    try {
      setPrintBusy(true, 'Submitting…');
      const result = await window.api.print.confirm(token, requestId);
      if (!result.ok) {
        setPrintBusy(false, `Print error: ${result.error.message}`);
      }
    } catch (err: any) {
      setPrintBusy(false, `Print failed: ${err?.message || 'Unknown'}`);
    }
  }, [setPrintBusy]);

  const handlePrintClick = useCallback(async () => {
    if (!window.api || !layoutFingerprint || layoutFingerprintRevision !== draft.revision || isPrintBusy) return;
    if (draft.text.trim().length === 0) return;

    const snapshot: PrintSnapshot = {
      requestId: crypto.randomUUID(),
      draftRevision: draft.revision,
      text: draft.text,
      profile: draft.profile,
      orientation: draft.orientation,
      resolvedFontFamily: draft.resolvedFontFamily,
      fontSizePt: draft.fontSizePt,
      alignment: draft.alignment,
      copies: draft.copies,
      expectedLayout: layoutFingerprint,
    };

    try {
      setPrintBusy(true, 'Preparing label…');
      const prepareRes = await window.api.print.prepare(snapshot);
      setPendingPrepareResult(prepareRes);

      if (prepareRes.requiresConfirmation) {
        setPrintBusy(false);
        if (prepareRes.confirmationReasons.includes('overflow_clipped')) {
          openDialog('confirm-clip');
          return;
        }
        if (prepareRes.confirmationReasons.includes('printer_offline')) {
          openDialog('confirm-offline');
          return;
        }
      }

      // No confirmation needed; submit immediately
      if (prepareRes.token) {
        await executeConfirmedPrint(prepareRes.token, snapshot.requestId);
      }
    } catch (err: any) {
      setPrintBusy(false, `Preparation error: ${err?.message || 'Unknown'}`);
    }
  }, [draft, executeConfirmedPrint, isPrintBusy, layoutFingerprint, layoutFingerprintRevision, openDialog, setPrintBusy]);

  // Keyboard shortcut Ctrl+P / Cmd+P
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrintClick();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handlePrintClick]);

  const handleConfirmClipped = async () => {
    closeDialog();
    if (pendingPrepareResult?.token) {
      await executeConfirmedPrint(pendingPrepareResult.token, pendingPrepareResult.snapshot.requestId);
    }
  };

  const handleCancelPrepare = async () => {
    closeDialog();
    if (pendingPrepareResult?.token && window.api) {
      await window.api.print.cancel(pendingPrepareResult.token);
    }
    setPendingPrepareResult(null);
  };

  const handleRestoreDefaultsConfirm = async () => {
    closeDialog();
    if (!window.api) return;
    try {
      const reset = await window.api.preferences.reset();
      resetPrefs(reset);
      hydratePreferences(reset, true);
      await handleScanPrinters();
    } catch (err) {
      console.error('Failed restoring defaults:', err);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
      <Toolbar
        onPrintClick={handlePrintClick}
        layoutReady={layoutFingerprintRevision === draft.revision}
      />

      <main className="flex flex-1 overflow-hidden">
        <LabelEditor />
      </main>

      <PrinterStatus onRescan={handleScanPrinters} />

      {/* Settings Dialog */}
      <SettingsDialog
        onRefreshPrinters={handleScanPrinters}
        onRestoreDefaults={() => openDialog('confirm-reset')}
        onSelectPrinter={async (profile, deviceName, manualConfirm) => {
          const selected = await window.api.printers.select(profile, deviceName, manualConfirm);
          if (selected) {
            selectQueue(profile, selected.deviceName);
            const current = usePreferencesStore.getState().preferences;
            updatePreferences({
              profiles: {
                ...current.profiles,
                [profile]: {
                  ...current.profiles[profile],
                  printer: {
                    deviceName: selected.deviceName,
                    platform: navigator.platform.toUpperCase().includes('MAC') ? 'darwin' : 'win32',
                    identityFingerprint: queueIdentityFingerprint(selected),
                    manualProfileConfirmed: manualConfirm,
                    usbConfirmed: selected.transport === 'usb' || manualConfirm,
                  },
                },
              },
            });
          }
          return selected;
        }}
      />

      {/* Overflow Confirmation Dialog */}
      <ConfirmDialog
        isOpen={activeDialog === 'confirm-clip'}
        title="Print Clipped Label?"
        message={`The text exceeds the ${draft.profile === '4x6' ? '4 × 6' : '2 × 1'} safe area and will be clipped to fit on a single label. Would you like to proceed with printing the visible portion?`}
        confirmLabel="Print Clipped Label"
        cancelLabel="Cancel"
        onConfirm={handleConfirmClipped}
        onCancel={handleCancelPrepare}
      />

      {/* Offline Printer Confirmation Dialog */}
      <ConfirmDialog
        isOpen={activeDialog === 'confirm-offline'}
        title="Printer Offline"
        message={`The printer "${selectedQueues[activeProfile]?.displayName || (activeProfile === '4x6' ? 'SP410' : 'SP310')}" is currently reported offline or unavailable by the operating system. Send to queue anyway? It may print when reconnected.`}
        confirmLabel="Send to Queue"
        cancelLabel="Cancel"
        onConfirm={handleConfirmClipped}
        onCancel={handleCancelPrepare}
      />

      {/* Restore Defaults Dialog */}
      <ConfirmDialog
        isOpen={activeDialog === 'confirm-reset'}
        title="Restore Factory Defaults?"
        message="This will reset both label profiles, their printer selections, and formatting to initial defaults. Your current text will be preserved."
        confirmLabel="Restore Defaults"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleRestoreDefaultsConfirm}
        onCancel={closeDialog}
      />
    </div>
  );
};
