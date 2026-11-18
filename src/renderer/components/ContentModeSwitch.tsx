import React from 'react';
import type { ContentMode } from '@shared/contracts';
import { useLabelStore } from '../stores/labelStore';
import { usePreferencesStore } from '../stores/preferencesStore';

const MODES: Array<{ mode: ContentMode; label: string; title: string }> = [
  { mode: 'text', label: 'Text', title: 'Type a text label' },
  { mode: 'image', label: 'Shipping label', title: 'Print a shipping label from a screen snip or PDF' },
];

/** Text / Shipping label, on the 4 × 6 tab only. Same pressed-button pattern as the orientation control. */
export const ContentModeSwitch: React.FC = () => {
  const activeProfile = useLabelStore((s) => s.activeProfile);
  const contentMode = useLabelStore((s) => s.contentMode);
  const setContentMode = useLabelStore((s) => s.setContentMode);
  const updateShipping = usePreferencesStore((s) => s.updateShipping);

  if (activeProfile !== '4x6') return null;

  const choose = (mode: ContentMode) => {
    setContentMode(mode);
    updateShipping({ mode4x6: mode });
  };

  return (
    <div
      role="group"
      aria-label="4 × 6 content"
      className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
    >
      {MODES.map(({ mode, label, title }) => (
        <button
          key={mode}
          type="button"
          onClick={() => choose(mode)}
          aria-pressed={contentMode === mode}
          className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
            contentMode === mode
              ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
          }`}
          title={title}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
