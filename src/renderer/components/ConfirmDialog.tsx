import React, { useId } from 'react';
import { ModalFrame } from './ModalFrame';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  const messageId = useId();

  if (!isOpen) return null;

  return (
    <ModalFrame
      labelledBy={titleId}
      describedBy={messageId}
      onEscape={onCancel}
      className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl focus:outline-hidden dark:bg-slate-800"
    >
      <h3 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p id={messageId} className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        {/* Focus starts on Cancel, so a stray Enter never sends a label or discards work. */}
        <button
          type="button"
          data-autofocus
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
            isDestructive
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalFrame>
  );
};
