import React, { useState } from 'react';
import type { NormalizedQueue, PrinterProfile } from '@shared/contracts';
import { isUnsupportedTransport } from '@shared/printerSelection';
import { useDeviceStore } from '../stores/deviceStore';
import { useUIStore } from '../stores/uiStore';
import { enumerateSystemFonts } from '../fonts/fontCatalog';

export interface SettingsDialogProps {
  onRefreshPrinters: () => void;
  onRestoreDefaults: () => void;
  onSelectPrinter: (
    profile: PrinterProfile,
    deviceName: string,
    manualConfirm: boolean
  ) => Promise<NormalizedQueue | null>;
}

const PROFILE_INFO: Record<PrinterProfile, { label: string; model: string; stock: string }> = {
  '4x6': { label: '4 × 6', model: 'SP410', stock: '4 × 6 inch thermal stock' },
  '2x1': { label: '2 × 1', model: 'SP310', stock: 'DYMO 30334 · 2¼ × 1¼ inch stock' },
};

/** Electron wraps main-process errors as "Error invoking remote method '...': Error: <message>". */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') || 'Could not select this printer.';
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  onRefreshPrinters,
  onRestoreDefaults,
  onSelectPrinter,
}) => {
  const { activeDialog, closeDialog } = useUIStore();
  const { queues, selectedQueues } = useDeviceStore();
  const [renamedProfile, setRenamedProfile] = useState<PrinterProfile | null>(null);
  const [selectedRenamedQueue, setSelectedRenamedQueue] = useState('');
  const [usbConfirmed, setUsbConfirmed] = useState(false);
  const [stockConfirmed, setStockConfirmed] = useState(false);
  const [refreshFontsSuccess, setRefreshFontsSuccess] = useState(false);
  // A correctly named queue whose connection type could not be read: the user
  // must confirm it is USB before it can be used.
  const [usbPrompt, setUsbPrompt] = useState<{ profile: PrinterProfile; deviceName: string } | null>(null);
  const [usbPromptConfirmed, setUsbPromptConfirmed] = useState(false);
  const [selectError, setSelectError] = useState<{ profile: PrinterProfile; message: string } | null>(null);

  if (activeDialog !== 'settings') return null;

  const handleSelectEligible = async (profile: PrinterProfile, queue: NormalizedQueue) => {
    setSelectError(null);
    try {
      await onSelectPrinter(profile, queue.deviceName, false);
    } catch (error) {
      setSelectError({ profile, message: describeError(error) });
    }
  };

  const handleConfirmUsb = async () => {
    if (!usbPrompt || !usbPromptConfirmed) return;
    const { profile, deviceName } = usbPrompt;
    setSelectError(null);
    try {
      await onSelectPrinter(profile, deviceName, true);
      setUsbPrompt(null);
      setUsbPromptConfirmed(false);
    } catch (error) {
      setSelectError({ profile, message: describeError(error) });
    }
  };

  const handleConfirmRenamed = async () => {
    if (!renamedProfile || !selectedRenamedQueue || !usbConfirmed || !stockConfirmed) return;
    setSelectError(null);
    try {
      await onSelectPrinter(renamedProfile, selectedRenamedQueue, true);
      setRenamedProfile(null);
      setSelectedRenamedQueue('');
      setUsbConfirmed(false);
      setStockConfirmed(false);
    } catch (error) {
      setSelectError({ profile: renamedProfile, message: describeError(error) });
    }
  };

  const handleRefreshFonts = async () => {
    await enumerateSystemFonts();
    setRefreshFontsSuccess(true);
    setTimeout(() => setRefreshFontsSuccess(false), 2500);
  };

  const unassignedQueues = queues.filter((queue) => queue.profile === null && !isUnsupportedTransport(queue.transport));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
          <button type="button" onClick={closeDialog} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <section>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Printer profiles</h3>
                <p className="mt-1 text-xs text-slate-500">Choose a USB queue for each stock profile. The app never falls back to the OS default printer.</p>
              </div>
              <button type="button" onClick={onRefreshPrinters} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">Scan Printers</button>
            </div>

            <div className="mt-4 space-y-4">
              {(['4x6', '2x1'] as PrinterProfile[]).map((profile) => {
                const info = PROFILE_INFO[profile];
                const eligibleQueues = queues.filter((queue) => queue.profile === profile);
                const selectedQueue = selectedQueues[profile];
                const isRenamedOpen = renamedProfile === profile;

                return (
                  <div key={profile} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{info.label} · iDPRT {info.model}</h4>
                        <p className="mt-0.5 text-[11px] text-slate-500">{info.stock} · fixed USB profile</p>
                      </div>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{profile === '4x6' ? 'SP410 Match' : 'SP310 Match'}</span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {eligibleQueues.map((queue) => {
                        const isSelected = selectedQueue?.deviceName === queue.deviceName;
                        const unsupported = isUnsupportedTransport(queue.transport);
                        const needsUsbConfirm = queue.requiresManualConfirmation && !isSelected && !unsupported;
                        return (
                          <button
                            key={queue.deviceName}
                            type="button"
                            disabled={unsupported}
                            onClick={() => {
                              setSelectError(null);
                              if (needsUsbConfirm) {
                                setUsbPrompt({ profile, deviceName: queue.deviceName });
                                setUsbPromptConfirmed(false);
                                return;
                              }
                              void handleSelectEligible(profile, queue);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? 'border-blue-500 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-900/20' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
                          >
                            <span>
                              <span className="block text-sm font-semibold text-slate-900 dark:text-white">{queue.displayName}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">Port: {queue.port || 'Unknown'} | Driver: {queue.driver || 'Default'} | Status: {queue.status}</span>
                              {unsupported && <span className="mt-0.5 block text-xs text-red-600 dark:text-red-400">Bluetooth and network queues are not supported.</span>}
                              {needsUsbConfirm && <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">Connection type unknown. Select to confirm it is USB.</span>}
                            </span>
                            <input type="radio" aria-label={`Use ${queue.displayName} for ${info.label}`} checked={isSelected} readOnly className="h-4 w-4 text-blue-600" />
                          </button>
                        );
                      })}
                      {usbPrompt?.profile === profile && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                          <p className="text-xs text-slate-700 dark:text-slate-300">
                            Label Maker could not tell how this queue is connected. Labels are only sent to USB printers.
                          </p>
                          <label className="mt-2 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={usbPromptConfirmed} onChange={(event) => setUsbPromptConfirmed(event.target.checked)} className="rounded" />
                            This printer is connected via USB
                          </label>
                          <div className="mt-3 flex gap-2">
                            <button type="button" disabled={!usbPromptConfirmed} onClick={() => void handleConfirmUsb()} className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Use this queue</button>
                            <button type="button" onClick={() => setUsbPrompt(null)} className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-300">Cancel</button>
                          </div>
                        </div>
                      )}
                      {selectError?.profile === profile && (
                        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{selectError.message}</div>
                      )}
                      {eligibleQueues.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 dark:border-slate-700">No matching {info.model} printer detected.</div>
                      )}
                    </div>

                    {!isRenamedOpen ? (
                      <button type="button" onClick={() => setRenamedProfile(profile)} className="mt-3 text-xs text-blue-600 hover:underline dark:text-blue-400">Choose a renamed {info.model} queue…</button>
                    ) : (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                        <h5 className="text-xs font-semibold text-amber-900 dark:text-amber-200">Manual {info.model} Queue Override</h5>
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">Use this only when the operating system queue was renamed.</p>
                        <select value={selectedRenamedQueue} onChange={(event) => setSelectedRenamedQueue(event.target.value)} className="mt-2 w-full rounded border border-slate-300 bg-white p-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <option value="">-- Select installed printer --</option>
                          {unassignedQueues.map((queue) => <option key={queue.deviceName} value={queue.deviceName}>{queue.displayName} ({queue.port || 'Port unknown'})</option>)}
                        </select>
                        <div className="mt-3 space-y-1.5 text-xs">
                          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><input type="checkbox" checked={usbConfirmed} onChange={(event) => setUsbConfirmed(event.target.checked)} className="rounded" />This printer is connected via USB</label>
                          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><input type="checkbox" checked={stockConfirmed} onChange={(event) => setStockConfirmed(event.target.checked)} className="rounded" />This printer has {info.stock}</label>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button type="button" disabled={!selectedRenamedQueue || !usbConfirmed || !stockConfirmed} onClick={() => void handleConfirmRenamed()} className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Use as {info.model}</button>
                          <button type="button" onClick={() => setRenamedProfile(null)} className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-300">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">System Fonts</h3>
            <p className="mt-1 text-xs text-slate-500">Label Maker enumerates local fonts installed on your computer.</p>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={() => void handleRefreshFonts()} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Refresh Fonts</button>
              {refreshFontsSuccess && <span className="text-xs text-emerald-600 dark:text-emerald-400">Fonts reloaded successfully!</span>}
            </div>
          </section>

          <section className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Restore Defaults</h3>
            <p className="mt-1 text-xs text-slate-500">Reset both profiles, their formatting, and printer selections. Current label text is preserved.</p>
            <button type="button" onClick={onRestoreDefaults} className="mt-2 rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20">Restore Factory Defaults…</button>
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-3 dark:border-slate-800">
          <button type="button" onClick={closeDialog} className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Done</button>
        </div>
      </div>
    </div>
  );
};
