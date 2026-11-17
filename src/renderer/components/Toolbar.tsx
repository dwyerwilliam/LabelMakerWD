import React, { useEffect, useRef } from 'react';
import type { Alignment, Orientation, PrinterProfile } from '@shared/contracts';
import { selectEffectiveContentMode, useLabelStore } from '../stores/labelStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useUIStore } from '../stores/uiStore';
import { useFontStore } from '../stores/fontStore';
import { usePrintBlockers, type PrintBlocker } from '../hooks/usePrintBlockers';
import { ContentModeSwitch } from './ContentModeSwitch';
import { ShippingControls } from './ShippingControls';
import { parseCopiesInput, parseFontSizeInput } from '@shared/inputValidation';

/** Why Print is disabled, for blockers that need explaining in the button's tooltip. */
const BLOCKER_MESSAGES: Partial<Record<PrintBlocker, string>> = {
  'no-image': 'Paste or drop a shipping label first',
  'image-processing': 'Preparing label…',
  'image-printing-pending': 'Printing shipping labels is not available in this build yet', // TODO(phase 7)
};

export interface ToolbarProps {
  onPrintClick: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onPrintClick }) => {
  const { activeProfile, draft, setActiveProfile, setOrientation, setFontFamily, setFontSize, stepFontSize, setAlignment, setCopies } =
    useLabelStore();
  const updatePreferences = usePreferencesStore((s) => s.update);
  const updateProfilePreferences = usePreferencesStore((s) => s.updateProfile);
  const printBlockers = usePrintBlockers();
  const isImageMode = useLabelStore(selectEffectiveContentMode) === 'image';
  const {
    openDialog,
    isPrintBusy,
    fontSizeDraft,
    setFontSizeDraft,
    copiesDraft,
    setCopiesDraft,
    fontPickerOpen,
    setFontPickerOpen,
    fontSearchQuery,
    setFontSearchQuery,
  } = useUIStore();

  const availableFonts = useFontStore((s) => s.fonts);
  const fontDropdownRef = useRef<HTMLDivElement>(null);

  // Sync draft strings when external state changes
  useEffect(() => {
    setFontSizeDraft(draft.fontSizePt.toString());
  }, [draft.fontSizePt, activeProfile, setFontSizeDraft]);

  useEffect(() => {
    setCopiesDraft(draft.copies.toString());
  }, [draft.copies, setCopiesDraft]);

  // Click outside font picker closes it
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target as Node)) {
        setFontPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setFontPickerOpen]);

  const handleOrientationChange = (orient: Orientation) => {
    setOrientation(orient);
    updateProfilePreferences(activeProfile, { orientation: orient });
  };

  const handleFontSelect = (family: string) => {
    setFontFamily(family);
    updateProfilePreferences(activeProfile, { fontFamily: family });
    setFontPickerOpen(false);
  };

  // An invalid entry is kept and flagged (Print is disabled while it stands);
  // the label keeps its last valid size. Escape restores the last valid value.
  const fontSizeResult = parseFontSizeInput(fontSizeDraft);
  const copiesResult = parseCopiesInput(copiesDraft);

  const handleFontSizeCommit = (raw: string) => {
    const parsed = parseFontSizeInput(raw);
    if (!parsed.ok) return;
    setFontSize(parsed.value);
    updateProfilePreferences(activeProfile, { fontSizePt: parsed.value });
    setFontSizeDraft(parsed.value.toString());
  };

  const handleCopiesCommit = (raw: string) => {
    const parsed = parseCopiesInput(raw);
    if (!parsed.ok) return;
    setCopies(parsed.value);
    setCopiesDraft(parsed.value.toString());
  };

  const handleAlignmentChange = (align: Alignment) => {
    setAlignment(align);
    updateProfilePreferences(activeProfile, { alignment: align });
  };

  const handleProfileChange = (profile: PrinterProfile) => {
    setActiveProfile(profile);
    updatePreferences({ activeProfile: profile });
  };

  const filteredFonts = availableFonts.filter((f) =>
    f.family.toLowerCase().includes(fontSearchQuery.toLowerCase())
  );

  const isPrintDisabled = printBlockers.length > 0;
  const isSmallProfile = activeProfile === '2x1';
  const profileLabel = isSmallProfile ? '2 × 1' : '4 × 6';

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        {/* Stock profile tabs */}
        <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label="Label stock profile">
          {(['4x6', '2x1'] as PrinterProfile[]).map((profile) => {
            const label = profile === '4x6' ? '4 × 6' : '2 × 1';
            const model = profile === '4x6' ? 'SP410' : 'SP310';
            return (
              <button
                key={profile}
                type="button"
                role="tab"
                aria-selected={activeProfile === profile}
                onClick={() => handleProfileChange(profile)}
                className={`rounded-sm px-2.5 py-1 text-xs font-semibold transition-colors ${
                  activeProfile === profile
                    ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
                title={`${label} label profile for ${model}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <ContentModeSwitch />

        <div className="flex items-center gap-1.5 rounded-sm bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <span className="text-slate-600 dark:text-slate-400">Stock:</span> {isSmallProfile ? 'DYMO 30334 · 2¼ × 1¼ in' : '4 × 6 in'}
        </div>

        {isImageMode ? <ShippingControls /> : (<>
        {/* Orientation Toggle */}
        {!isSmallProfile ? <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => handleOrientationChange('portrait')}
            aria-pressed={draft.orientation === 'portrait'}
            className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
              draft.orientation === 'portrait'
                ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
            title="Portrait Layout (4 x 6)"
          >
            Portrait
          </button>
          <button
            type="button"
            onClick={() => handleOrientationChange('landscape')}
            aria-pressed={draft.orientation === 'landscape'}
            className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
              draft.orientation === 'landscape'
                ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
            title="Landscape Layout (6 x 4)"
          >
            Landscape
          </button>
        </div> : (
          <div className="rounded-sm bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="The SP310 outputs this stock in landscape orientation">
            Landscape
          </div>
        )}

        {/* Font Family Picker */}
        <div
          className="relative"
          ref={fontDropdownRef}
          onKeyDown={(e) => {
            // Escape closes the list and puts focus back on the button that opened it.
            if (e.key === 'Escape' && fontPickerOpen) {
              e.stopPropagation();
              setFontPickerOpen(false);
              fontDropdownRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
            }
          }}
        >
          <button
            type="button"
            onClick={() => setFontPickerOpen(!fontPickerOpen)}
            aria-label={`Font family: ${draft.preferredFontFamily}`}
            aria-haspopup="true"
            aria-expanded={fontPickerOpen}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 w-36"
            title="Select Font Family"
          >
            <span className="truncate">{draft.preferredFontFamily}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">▼</span>
          </button>

          {fontPickerOpen && (
            <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <input
                type="text"
                value={fontSearchQuery}
                onChange={(e) => setFontSearchQuery(e.target.value)}
                placeholder="Search installed fonts..."
                className="w-full rounded-sm border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                autoFocus
              />
              <div className="mt-2 max-h-48 overflow-y-auto">
                {filteredFonts.map((font) => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleFontSelect(font.family)}
                    className={`w-full text-left px-2 py-1 text-xs rounded-sm truncate hover:bg-slate-100 dark:hover:bg-slate-700 ${
                      font.family === draft.preferredFontFamily
                        ? 'font-semibold text-blue-600 dark:text-blue-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                    style={{ fontFamily: font.family }}
                  >
                    {font.family}
                  </button>
                ))}
                {filteredFonts.length === 0 && (
                  <div className="p-2 text-center text-xs text-slate-500 dark:text-slate-400">No matching fonts</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Font Size */}
        <div className="flex items-center gap-1">
          <label htmlFor="fontSizeInput" className="text-xs text-slate-500 dark:text-slate-400">
            Size:
          </label>
          <div className="flex items-center rounded-md border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/50 dark:border-slate-700 dark:bg-slate-800">
            <input
              id="fontSizeInput"
              type="text"
              value={fontSizeDraft}
              onChange={(e) => setFontSizeDraft(e.target.value)}
              onBlur={(e) => handleFontSizeCommit(e.target.value)}
              aria-invalid={!fontSizeResult.ok}
              aria-describedby={fontSizeResult.ok ? undefined : 'fontSizeError'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFontSizeCommit((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setFontSizeDraft(draft.fontSizePt.toString());
              }}
              className={`w-12 px-1.5 py-1 text-center text-xs focus:outline-hidden dark:bg-transparent ${fontSizeResult.ok ? 'text-slate-800 dark:text-slate-200' : 'text-red-600 dark:text-red-400'}`}
              title="Font point size (6 - 288)"
            />
            <span className="pr-1 text-[10px] text-slate-500 dark:text-slate-400">pt</span>
            <div className="flex flex-col border-l border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  stepFontSize(1);
                  updateProfilePreferences(activeProfile, { fontSizePt: Math.min(288, draft.fontSizePt + 1) });
                }}
                className="px-1 text-[9px] hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Increase 1 pt"
                aria-label="Increase font size by 1 point"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => {
                  stepFontSize(-1);
                  updateProfilePreferences(activeProfile, { fontSizePt: Math.max(6, draft.fontSizePt - 1) });
                }}
                className="px-1 text-[9px] hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Decrease 1 pt"
                aria-label="Decrease font size by 1 point"
              >
                ▼
              </button>
            </div>
          </div>
          {!fontSizeResult.ok && (
            <span id="fontSizeError" role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {fontSizeResult.message}
            </span>
          )}
        </div>

        {/* Alignment */}
        <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {(['left', 'center', 'right'] as Alignment[]).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => handleAlignmentChange(align)}
              aria-label={`Align ${align}`}
              aria-pressed={draft.alignment === align}
              className={`rounded-sm px-2 py-1 text-xs capitalize transition-colors ${
                draft.alignment === align
                  ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
              title={`Align ${align}`}
            >
              {align[0].toUpperCase()}
            </button>
          ))}
        </div>

        </>)}

        {/* Copies */}
        <div className="flex items-center gap-1">
          <label htmlFor="copiesInput" className="text-xs text-slate-500 dark:text-slate-400">
            Copies:
          </label>
          <div className="flex items-center rounded-md border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/50 dark:border-slate-700 dark:bg-slate-800">
            <input
              id="copiesInput"
              type="text"
              value={copiesDraft}
              onChange={(e) => setCopiesDraft(e.target.value)}
              onBlur={(e) => handleCopiesCommit(e.target.value)}
              aria-invalid={!copiesResult.ok}
              aria-describedby={copiesResult.ok ? undefined : 'copiesError'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCopiesCommit((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setCopiesDraft(draft.copies.toString());
              }}
              className={`w-10 px-1 py-1 text-center text-xs focus:outline-hidden dark:bg-transparent ${copiesResult.ok ? 'text-slate-800 dark:text-slate-200' : 'text-red-600 dark:text-red-400'}`}
              title="Number of copies (1 - 99)"
            />
            <div className="flex flex-col border-l border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setCopies(Math.min(99, draft.copies + 1))}
                className="px-1 text-[9px] hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Increase copies"
                aria-label="Increase copies by 1"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => setCopies(Math.max(1, draft.copies - 1))}
                className="px-1 text-[9px] hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Decrease copies"
                aria-label="Decrease copies by 1"
              >
                ▼
              </button>
            </div>
          </div>
          {!copiesResult.ok && (
            <span id="copiesError" role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {copiesResult.message}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Settings Button */}
        <button
          type="button"
          onClick={() => openDialog('settings')}
          className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          title="Printer & App Settings"
          aria-label="Printer and app settings"
        >
          ⚙️
        </button>

        {/* Print Button */}
        <button
          type="button"
          onClick={onPrintClick}
          disabled={isPrintDisabled}
          className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold text-white shadow-xs transition-colors ${
            isPrintDisabled
              ? 'bg-slate-300 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
          title={
            (isPrintDisabled && printBlockers.map((b) => BLOCKER_MESSAGES[b]).find(Boolean)) ||
            `Print ${profileLabel} label (Ctrl+P / Cmd+P)`
          }
        >
          {isPrintBusy ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Sending…</span>
            </>
          ) : (
            <span>Print {profileLabel}</span>
          )}
        </button>
      </div>
    </header>
  );
};
