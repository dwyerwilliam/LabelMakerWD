import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { LabelEditor } from './components/LabelEditor';
import { PrinterStatus } from './components/PrinterStatus';
import { SettingsDialog } from './components/SettingsDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useLabelStore } from './stores/labelStore';
import { useDeviceStore } from './stores/deviceStore';
import { usePreferencesStore } from './stores/preferencesStore';
import { useUIStore } from './stores/uiStore';
import { useFontStore } from './stores/fontStore';
import { resolveFontFamily } from './fonts/fontCatalog';
import { usePrintBlockers } from './hooks/usePrintBlockers';
import type { ConfirmationReason, PrintPrepareResult, PrintSnapshot } from '@shared/contracts';
import { describeIpcError } from './ipcError';
import { queueIdentityFingerprint } from '@shared/printerSelection';

export const App: React.FC = () => {
  const { activeProfile, draft, layoutFingerprint, hydratePreferences } = useLabelStore();
  const printBlockers = usePrintBlockers();
  const { setQueues, setScanning, setError, selectedQueues, selectQueue } = useDeviceStore();
  const { hydrate, reset: resetPrefs, update: updatePreferences } = usePreferencesStore();
  const {
    activeDialog,
    openDialog,
    closeDialog,
    setPrintBusy,
    flashPrintStatus,
    setPrintOutcomeUncertain,
    notice,
    setNotice,
  } = useUIStore();

  // Installed fonts: read at launch (and again from Settings → Refresh fonts).
  const fontStatus = useFontStore((s) => s.status);
  const fontList = useFontStore((s) => s.fonts);
  const fontSource = useFontStore((s) => s.source);
  const setResolvedFont = useLabelStore((s) => s.setResolvedFont);
  useEffect(() => {
    void useFontStore.getState().load();
  }, []);

  // A saved font that is not installed is replaced by the default, visibly (a
  // notice above the label); the saved preference itself is kept.
  useEffect(() => {
    if (fontStatus !== 'ready') return;
    const { resolved } = resolveFontFamily(draft.preferredFontFamily, { fonts: fontList, source: fontSource });
    setResolvedFont(resolved);
  }, [fontStatus, fontList, fontSource, draft.preferredFontFamily, draft.profile, setResolvedFont]);

  const [pendingPrepareResult, setPendingPrepareResult] = useState<PrintPrepareResult | null>(null);
  // Confirmations still to ask after the one on screen (for example clipped text
  // on a printer that is offline: both must be agreed to, one after the other).
  const [pendingConfirmations, setPendingConfirmations] = useState<ConfirmationReason[]>([]);

  // Main asks before closing a window that still holds label text, so it only
  // needs to know whether there is any (the text itself stays in the renderer).
  const labelHasText = draft.text.trim().length > 0;
  useEffect(() => {
    if (!window.api) return;
    void window.api.app.setLabelHasText(labelHasText).catch((err: unknown) => {
      console.warn('Could not report label state to main:', err);
    });
  }, [labelHasText]);

  // Scan printers. Overlapping requests share one scan. A background scan (the
  // window regaining focus) updates the queues quietly instead of flashing
  // "Scanning…" in the status bar.
  const scanInFlight = useRef<Promise<void> | null>(null);
  const handleScanPrinters = useCallback((options?: { background?: boolean }): Promise<void> => {
    if (!window.api) return Promise.resolve();
    if (scanInFlight.current) return scanInFlight.current;

    const background = options?.background === true;
    const run = (async () => {
      try {
        if (!background) {
          setScanning(true);
          setError(null);
        }
        const queues = await window.api.printers.scan();
        setQueues(queues, usePreferencesStore.getState().preferences);
        setError(null);
      } catch (err: unknown) {
        console.error('Scan error:', err);
        if (!background) setError(describeIpcError(err, 'Failed scanning printers'));
      } finally {
        if (!background) setScanning(false);
        scanInFlight.current = null;
      }
    })();
    scanInFlight.current = run;
    return run;
  }, [setError, setQueues, setScanning]);

  const handleRescan = useCallback(() => {
    void handleScanPrinters();
  }, [handleScanPrinters]);

  // Pick up a printer that was plugged in or installed while the app was in the
  // background. Skipped if a scan just finished.
  useEffect(() => {
    const onFocus = () => {
      const { lastScanAt, isScanning } = useDeviceStore.getState();
      if (isScanning || Date.now() - lastScanAt < 5000) return;
      void handleScanPrinters({ background: true });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [handleScanPrinters]);

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

      // On the very first launch, a machine that only has the SP310 opens on its
      // 2 × 1 profile so it is usable immediately. Later launches restore the
      // saved profile.
      try {
        const { firstLaunch, settingsProblem } = await window.api.app.getLaunchInfo();
        if (settingsProblem) {
          const copy = settingsProblem.backupFile ? ` A copy of the original was saved as ${settingsProblem.backupFile}.` : '';
          useUIStore.getState().setNotice(
            settingsProblem.kind === 'repaired'
              ? `Some saved settings were not valid and were reset to their defaults (${(settingsProblem.fields ?? []).join(', ')}).${copy}`
              : settingsProblem.kind === 'newer'
                ? `Your settings were saved by a newer version of Label Maker, so defaults are being used.${copy}`
                : `Your saved settings could not be read, so defaults are being used.${copy}`
          );
        }
        const { selectedQueues } = useDeviceStore.getState();
        if (firstLaunch && !selectedQueues['4x6'] && selectedQueues['2x1']) {
          useLabelStore.getState().setActiveProfile('2x1');
          usePreferencesStore.getState().update({ activeProfile: '2x1' });
        }
      } catch (err) {
        console.warn('Could not read launch info:', err);
      }
    }

    void init();
  }, [handleScanPrinters, hydrate, hydratePreferences]);

  // Subscribe to print state events from main
  useEffect(() => {
    if (!window.api) return;

    const unsubscribe = window.api.print.onStateEvent((evt) => {
      if (evt.state === 'submitting') {
        setPrintBusy(true, 'Sending to printer…');
      } else if (evt.state === 'submitted') {
        // Also covers a late answer after an unconfirmed outcome.
        setPrintOutcomeUncertain(false);
        flashPrintStatus(evt.detail || 'Sent to printer queue', 5000);
      } else if (evt.state === 'failed') {
        setPrintOutcomeUncertain(false);
        flashPrintStatus(`Print failed: ${evt.detail || 'Unknown error'}`, 8000);
      } else if (evt.state === 'uncertain') {
        // Stays on screen until the next print: the user has to look at the queue.
        setPrintOutcomeUncertain(true);
        setPrintBusy(false, evt.detail || 'The print outcome is unconfirmed. Check the printer queue.');
      }
    });

    return unsubscribe;
  }, [flashPrintStatus, setPrintBusy, setPrintOutcomeUncertain]);

  // Handle print flow
  const executeConfirmedPrint = useCallback(async (token: string, requestId: string) => {
    if (!window.api) return;
    try {
      setPrintBusy(true, 'Submitting…');
      const result = await window.api.print.confirm(token, requestId);
      // An unconfirmed outcome already put its own (lasting) message on screen.
      if (!result.ok && result.error.code !== 'PRINT_OUTCOME_UNCERTAIN') {
        flashPrintStatus(`Print error: ${result.error.message}`, 8000);
      }
    } catch (err: unknown) {
      flashPrintStatus(`Print failed: ${describeIpcError(err)}`, 8000);
    }
  }, [flashPrintStatus, setPrintBusy]);

  const askNextConfirmation = useCallback((reasons: ConfirmationReason[]) => {
    const [next, ...rest] = reasons;
    setPendingConfirmations(rest);
    openDialog(
      next === 'layout_differs' ? 'confirm-layout' : next === 'overflow_clipped' ? 'confirm-clip' : 'confirm-unavailable'
    );
  }, [openDialog]);

  const handlePrintClick = useCallback(async () => {
    // Same rules as the Print button, so the shortcut cannot print when the button is disabled.
    if (!window.api || printBlockers.length > 0 || !layoutFingerprint) return;

    // The last job may or may not have printed. Do not queue a possible
    // duplicate until the user has looked at the printer queue.
    if (useUIStore.getState().printOutcomeUncertain) {
      openDialog('confirm-uncertain');
      return;
    }

    const snapshot: PrintSnapshot = {
      requestId: crypto.randomUUID(),
      draftRevision: draft.revision,
      contentKind: 'text',
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

      if (prepareRes.requiresConfirmation && prepareRes.confirmationReasons.length > 0) {
        setPrintBusy(false);
        askNextConfirmation(prepareRes.confirmationReasons);
        return;
      }

      // No confirmation needed; submit immediately
      if (prepareRes.token) {
        await executeConfirmedPrint(prepareRes.token, snapshot.requestId);
      }
    } catch (err: unknown) {
      flashPrintStatus(`Preparation error: ${describeIpcError(err)}`, 8000);
    }
  }, [askNextConfirmation, draft, executeConfirmedPrint, flashPrintStatus, layoutFingerprint, openDialog, printBlockers, setPrintBusy]);

  // Keyboard shortcut Ctrl+P / Cmd+P
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        // A question is on screen: answer it first rather than preparing another label behind it.
        if (useUIStore.getState().activeDialog !== 'none') return;
        void handlePrintClick();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handlePrintClick]);

  const handleConfirmStep = async () => {
    closeDialog();
    if (pendingConfirmations.length > 0) {
      askNextConfirmation(pendingConfirmations);
      return;
    }
    if (pendingPrepareResult?.token) {
      await executeConfirmedPrint(pendingPrepareResult.token, pendingPrepareResult.snapshot.requestId);
    }
  };

  const handleCancelPrepare = async () => {
    closeDialog();
    setPendingConfirmations([]);
    if (pendingPrepareResult?.token && window.api) {
      await window.api.print.cancel(pendingPrepareResult.token);
    }
    setPendingPrepareResult(null);
  };

  const handleAcknowledgeUncertain = () => {
    closeDialog();
    setPrintOutcomeUncertain(false);
    void handlePrintClick();
  };

  const activeQueue = selectedQueues[activeProfile];
  const profileName = activeProfile === '4x6' ? '4 × 6 (SP410)' : '2 × 1 (SP310)';
  const unavailablePhrase =
    activeQueue?.status === 'paused' ? 'paused' : activeQueue?.status === 'error' ? 'in an error state' : 'offline';

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
      <Toolbar onPrintClick={handlePrintClick} />

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 bg-amber-100 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-semibold underline hover:no-underline">
            Dismiss
          </button>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <LabelEditor />
      </main>

      <PrinterStatus onRescan={handleRescan} />

      {/* Settings Dialog */}
      <SettingsDialog
        onRefreshPrinters={handleRescan}
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

      {/* The print window laid the text out differently from the preview */}
      <ConfirmDialog
        isOpen={activeDialog === 'confirm-layout'}
        title="Label May Print Differently"
        message="The label wraps differently on the page that will be printed than in the preview, so the paper may not look like what you see. Print it anyway?"
        confirmLabel="Print Anyway"
        cancelLabel="Cancel"
        onConfirm={handleConfirmStep}
        onCancel={handleCancelPrepare}
      />

      {/* Overflow Confirmation Dialog */}
      <ConfirmDialog
        isOpen={activeDialog === 'confirm-clip'}
        title="Print Clipped Label?"
        message={`The text exceeds the ${draft.profile === '4x6' ? '4 × 6' : '2 × 1'} safe area and will be clipped to fit on a single label. Would you like to proceed with printing the visible portion?`}
        confirmLabel="Print Clipped Label"
        cancelLabel="Cancel"
        onConfirm={handleConfirmStep}
        onCancel={handleCancelPrepare}
      />

      {/* Offline, paused or faulted printer confirmation */}
      <ConfirmDialog
        isOpen={activeDialog === 'confirm-unavailable'}
        title="Printer Unavailable"
        message={`The ${profileName} printer "${activeQueue?.displayName ?? profileName}" is reported ${unavailablePhrase} by the operating system. Send this label to its queue anyway? Queued labels may print when the printer becomes available.`}
        confirmLabel="Send to Queue"
        cancelLabel="Cancel"
        onConfirm={handleConfirmStep}
        onCancel={handleCancelPrepare}
      />

      {/* The last job's outcome is unknown */}
      <ConfirmDialog
        isOpen={activeDialog === 'confirm-uncertain'}
        title="Check the Printer Queue First"
        message="The operating system never confirmed the last label. It may have printed, may still print, or may have been lost. Look at the printer queue, then print again only if you still need a label; otherwise a duplicate may come out."
        confirmLabel="Print Again"
        cancelLabel="Cancel"
        onConfirm={handleAcknowledgeUncertain}
        onCancel={closeDialog}
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
