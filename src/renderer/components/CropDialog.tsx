import React, { useId } from 'react';
import { ModalFrame } from './ModalFrame';
import { useShippingStore } from '../stores/shippingStore';
import { useUIStore } from '../stores/uiStore';

/**
 * Choose the label area. TODO(phase 6): show the page with an editable crop box, page
 * navigation, rotation, Auto-detect, Whole page and the live 4 × 6 thumbnail (spec §11.5).
 * For now it shows the status line and lets the user accept the suggested area or cancel.
 */
export const CropDialog: React.FC = () => {
  const titleId = useId();
  const statusId = useId();
  const activeDialog = useUIStore((s) => s.activeDialog);
  const cropDialog = useShippingStore((s) => s.cropDialog);

  if (activeDialog !== 'shipping-crop' || !cropDialog) return null;

  const cancel = () => useShippingStore.getState().cancelCrop();
  const accept = () => void useShippingStore.getState().acceptCrop(cropDialog.initial);

  return (
    <ModalFrame labelledBy={titleId} describedBy={cropDialog.status ? statusId : undefined} onEscape={cancel}
      className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl focus:outline-hidden dark:bg-slate-800"
    >
      <div>
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-white">
            Choose the label area
          </h2>
        </div>
        <div className="space-y-2 px-6 py-4 text-sm text-slate-700 dark:text-slate-300">
          <p>
            {cropDialog.source.kind === 'pdf' ? `${cropDialog.source.fileName}, page ${cropDialog.initial.pageIndex + 1}.` : 'Image.'}{' '}
            The suggested area will be printed as a {'4 × 6'} label.
          </p>
          {cropDialog.status && (
            <p id={statusId} role="status" className="font-medium text-slate-900 dark:text-white">
              {cropDialog.status}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={cancel}
            className="rounded-sm border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            onClick={accept}
            className="rounded-sm bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Use this area
          </button>
        </div>
      </div>
    </ModalFrame>
  );
};
