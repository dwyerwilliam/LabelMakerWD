import React, { useState } from 'react';
import type { NormalizedQueue } from '@shared/contracts';
import { useDeviceStore } from '../stores/deviceStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useUIStore } from '../stores/uiStore';
import { enumerateSystemFonts } from '../fonts/fontCatalog';

export interface SettingsDialogProps {
  onRefreshPrinters: () => void;
  onRestoreDefaults: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  onRefreshPrinters,
  onRestoreDefaults,
}) => {
  const { activeDialog, closeDialog } = useUIStore();
  const { queues, selectedQueue, selectQueue } = useDeviceStore();
  const { preferences, update } = usePreferencesStore();

  const [renamedMode, setRenamedMode] = useState(false);
  const [selectedRenamedQueue, setSelectedRenamedQueue] = useState<string>('');
  const [usbConfirmed, setUsbConfirmed] = useState(false);
  const [stockConfirmed, setStockConfirmed] = useState(false);
  const [refreshFontsSuccess, setRefreshFontsSuccess] = useState(false);

  if (activeDialog !== 'settings') return null;

  const eligibleQueues = queues.filter((q) => q.isEligibleSp410);
  const nonEligibleQueues = queues.filter((q) => !q.isEligibleSp410);

  const handleSelectEligible = (queue: NormalizedQueue) => {
    selectQueue(queue.deviceName);
    update({
      printer: {
        deviceName: queue.deviceName,
        platform: process.platform === 'darwin' ? 'darwin' : 'win32',
        identityFingerprint: `${queue.model}:${queue.driver}:${queue.port}`,
        manualSp410Confirmed: false,
        usbConfirmed: queue.transport === 'usb',
      },
    });
  };

  const handleConfirmRenamed = () => {
    if (!selectedRenamedQueue || !usbConfirmed || !stockConfirmed) return;

    const queue = queues.find((q) => q.deviceName === selectedRenamedQueue);
    if (!queue) return;

    selectQueue(queue.deviceName);
    update({
      printer: {
        deviceName: queue.deviceName,
        platform: process.platform === 'darwin' ? 'darwin' : 'win32',
        identityFingerprint: `${queue.model}:${queue.driver}:${queue.port}`,
        manualSp410Confirmed: true,
        usbConfirmed: true,
      },
    });
    setRenamedMode(false);
  };

  const handleRefreshFonts = async () => {
    await enumerateSystemFonts();
    setRefreshFontsSuccess(true);
    setTimeout(() => setRefreshFontsSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
          <button
            type="button"
            onClick={closeDialog}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Printer Selection Section */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                iDPRT SP410 Print Queue
              </h3>
              <button
                type="button"
                onClick={onRefreshPrinters}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Scan Printers
              </button>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              Only iDPRT SP410 / SP410BT queues with 4 × 6 inch thermal stock over USB are supported.
            </p>

            <div className="mt-3 space-y-2">
              {eligibleQueues.map((q) => {
                const isSelected = selectedQueue?.deviceName === q.deviceName;
                return (
                  <div
                    key={q.deviceName}
                    onClick={() => handleSelectEligible(q)}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">
                          {q.displayName}
                        </span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                          SP410 Match
                        </span>
                        {q.transport === 'usb' && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            USB
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Port: {q.port || 'Unknown'} | Driver: {q.driver || 'Default'} | Status: {q.status}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="printer"
                      checked={isSelected}
                      onChange={() => handleSelectEligible(q)}
                      className="h-4 w-4 text-blue-600"
                    />
                  </div>
                );
              })}

              {eligibleQueues.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700">
                  No iDPRT SP410 printers detected. Ensure your SP410 is powered on and connected via USB.
                </div>
              )}
            </div>

            {/* Renamed Printer Override */}
            <div className="mt-4">
              {!renamedMode ? (
                <button
                  type="button"
                  onClick={() => setRenamedMode(true)}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Choose a renamed SP410 queue…
                </button>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                  <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Manual SP410 Queue Override
                  </h4>
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                    If your SP410 printer queue has been renamed in your operating system, select it below:
                  </p>

                  <select
                    value={selectedRenamedQueue}
                    onChange={(e) => setSelectedRenamedQueue(e.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white p-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Select installed printer --</option>
                    {nonEligibleQueues.map((q) => (
                      <option key={q.deviceName} value={q.deviceName}>
                        {q.displayName} ({q.port || 'Port unknown'})
                      </option>
                    ))}
                  </select>

                  <div className="mt-3 space-y-1.5 text-xs">
                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={usbConfirmed}
                        onChange={(e) => setUsbConfirmed(e.target.checked)}
                        className="rounded"
                      />
                      <span>This printer is connected via USB</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={stockConfirmed}
                        onChange={(e) => setStockConfirmed(e.target.checked)}
                        className="rounded"
                      />
                      <span>This printer is loaded with 4 × 6 inch thermal stock</span>
                    </label>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={!selectedRenamedQueue || !usbConfirmed || !stockConfirmed}
                      onClick={handleConfirmRenamed}
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Use as SP410
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamedMode(false)}
                      className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Typography & Fonts Section */}
          <section className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              System Fonts
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Label Maker enumerates local fonts installed on your computer.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleRefreshFonts}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Refresh Fonts
              </button>
              {refreshFontsSuccess && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  Fonts reloaded successfully!
                </span>
              )}
            </div>
          </section>

          {/* Reset Defaults Section */}
          <section className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Restore Defaults
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Reset preferred orientation, font, size, alignment, and printer selection to initial defaults. Your current label text will be preserved.
            </p>
            <div className="mt-2">
              <button
                type="button"
                onClick={onRestoreDefaults}
                className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                Restore Factory Defaults…
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-200 px-6 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={closeDialog}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
