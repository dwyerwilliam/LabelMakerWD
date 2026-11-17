import React from 'react';
import { useDeviceStore } from '../stores/deviceStore';
import { useUIStore } from '../stores/uiStore';

export interface PrinterStatusProps {
  onRescan: () => void;
}

export const PrinterStatus: React.FC<PrinterStatusProps> = ({ onRescan }) => {
  const { selectedQueue, isScanning, error } = useDeviceStore();
  const { openDialog, printStatusText } = useUIStore();

  let statusText = 'Looking for SP410…';
  let badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

  if (isScanning) {
    statusText = 'Scanning for printers…';
    badgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  } else if (error) {
    statusText = `Error: ${error}`;
    badgeColor = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  } else if (selectedQueue) {
    if (selectedQueue.status === 'ready') {
      statusText = `${selectedQueue.displayName} — Ready`;
      badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    } else if (selectedQueue.status === 'offline') {
      statusText = `${selectedQueue.displayName} — Offline`;
      badgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
    } else {
      statusText = `${selectedQueue.displayName} — Installed`;
      badgeColor = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    }
  } else {
    statusText = 'No SP410 selected';
    badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }

  return (
    <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => openDialog('settings')}
          className="flex items-center gap-1.5 hover:underline"
        >
          <span className={`inline-block h-2 w-2 rounded-full ${badgeColor.split(' ')[0]}`} />
          <span className="font-medium text-slate-800 dark:text-slate-200">{statusText}</span>
        </button>

        {printStatusText && (
          <span className="ml-3 font-semibold text-blue-600 dark:text-blue-400">
            {printStatusText}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRescan}
          disabled={isScanning}
          className="font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 dark:text-blue-400"
        >
          {isScanning ? 'Rescanning…' : 'Rescan'}
        </button>
        <span className="text-slate-300 dark:text-slate-700">|</span>
        <button
          type="button"
          onClick={() => openDialog('settings')}
          className="font-medium hover:underline text-slate-600 dark:text-slate-400"
        >
          Settings
        </button>
      </div>
    </footer>
  );
};
