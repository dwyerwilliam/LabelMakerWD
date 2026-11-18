import React from 'react';
import type { Darkness } from '@shared/shipping';
import { useShippingActions } from '../hooks/useShippingInput';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useShippingStore } from '../stores/shippingStore';

const BUTTON =
  'rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';
const ICON_BUTTON =
  'rounded-md border border-slate-200 bg-white px-2 py-1 text-sm leading-none text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

/** The toolbar controls shown in Shipping label mode, in place of the text formatting controls. */
export const ShippingControls: React.FC = () => {
  const { openFilePicker, pasteFromSystemClipboard } = useShippingActions();
  const hasImage = useShippingStore((s) => s.processed !== null);
  const busy = useShippingStore((s) => s.busy !== null);
  const darkness = usePreferencesStore((s) => s.preferences.shippingLabel?.darkness ?? 3);
  const updateShipping = usePreferencesStore((s) => s.updateShipping);
  const editDisabled = !hasImage || busy;

  const setDarkness = (value: Darkness) => {
    updateShipping({ darkness: value });
    void useShippingStore.getState().reprocess();
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button type="button" className={BUTTON} onClick={() => void pasteFromSystemClipboard()} title="Paste a screen snip from the clipboard">
          Paste
        </button>
        <button type="button" className={BUTTON} onClick={openFilePicker} title="Open a label PDF or image">
          Open file…
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={editDisabled}
          onClick={() => useShippingStore.getState().openAdjustCrop()}
          title="Choose which part of the page is the label"
        >
          Adjust crop…
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={ICON_BUTTON}
          disabled={editDisabled}
          onClick={() => void useShippingStore.getState().rotate(-90)}
          aria-label="Rotate left"
          title="Rotate left"
        >
          ⟲
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          disabled={editDisabled}
          onClick={() => void useShippingStore.getState().rotate(90)}
          aria-label="Rotate right"
          title="Rotate right"
        >
          ⟳
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <label htmlFor="shippingDarkness" className="text-xs text-slate-500 dark:text-slate-400">
          Darkness
        </label>
        <input
          id="shippingDarkness"
          type="range"
          min={1}
          max={5}
          step={1}
          value={darkness}
          aria-valuetext={`${darkness} of 5`}
          onChange={(e) => setDarkness(Number(e.target.value) as Darkness)}
          className="w-20 accent-blue-600"
          title="Higher prints thicker text and bars"
        />
        <span className="w-3 text-xs tabular-nums text-slate-600 dark:text-slate-300" aria-hidden="true">
          {darkness}
        </span>
      </div>

      <button
        type="button"
        className={BUTTON}
        disabled={editDisabled}
        onClick={() => useShippingStore.getState().clear()}
        title="Remove this label"
      >
        Clear
      </button>
    </>
  );
};
