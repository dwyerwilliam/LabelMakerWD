import React, { useEffect, useRef, useState } from 'react';
import type { Alignment, FontItem, Orientation, PrinterProfile } from '@shared/contracts';
import { useLabelStore } from '../stores/labelStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useDeviceStore } from '../stores/deviceStore';
import { useUIStore } from '../stores/uiStore';
import { enumerateSystemFonts } from '../fonts/fontCatalog';

export interface ToolbarProps {
  onPrintClick: () => void;
  layoutReady: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onPrintClick, layoutReady }) => {
  const { activeProfile, draft, setActiveProfile, setOrientation, setFontFamily, setFontSize, stepFontSize, setAlignment, setCopies } =
    useLabelStore();
  const updatePreferences = usePreferencesStore((s) => s.update);
  const updateProfilePreferences = usePreferencesStore((s) => s.updateProfile);
  const selectedQueue = useDeviceStore((s) => s.selectedQueues[activeProfile]);
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

  const [availableFonts, setAvailableFonts] = useState<FontItem[]>([]);
  const fontDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    enumerateSystemFonts().then(setAvailableFonts);
  }, []);

  // Sync draft strings when external state changes
  useEffect(() => {
    setFontSizeDraft(draft.fontSizePt.toString());
  }, [draft.fontSizePt, setFontSizeDraft]);

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

  const handleFontSizeCommit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 6 && parsed <= 288) {
      const rounded = Math.round(parsed * 2) / 2;
      setFontSize(rounded);
      updateProfilePreferences(activeProfile, { fontSizePt: rounded });
      setFontSizeDraft(rounded.toString());
    } else {
      // Revert to valid value on escape or blur
      setFontSizeDraft(draft.fontSizePt.toString());
    }
  };

  const handleCopiesCommit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 99) {
      setCopies(parsed);
      setCopiesDraft(parsed.toString());
    } else {
      setCopiesDraft(draft.copies.toString());
    }
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

  const isPrintDisabled = draft.text.trim().length === 0 || isPrintBusy || !selectedQueue || !layoutReady;
  const isSmallProfile = activeProfile === '2x1';
  const profileLabel = isSmallProfile ? '2 × 1' : '4 × 6';

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  activeProfile === profile
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
                title={`${label} label profile for ${model}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <span className="text-slate-400">Stock:</span> {isSmallProfile ? 'DYMO 30334 · 2¼ × 1¼ in' : '4 × 6 in'}
        </div>

        {/* Orientation Toggle */}
        {!isSmallProfile ? <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => handleOrientationChange('portrait')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              draft.orientation === 'portrait'
                ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
            title="Portrait Layout (4 x 6)"
          >
            Portrait
          </button>
          <button
            type="button"
            onClick={() => handleOrientationChange('landscape')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              draft.orientation === 'landscape'
                ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
            title="Landscape Layout (6 x 4)"
          >
            Landscape
          </button>
        </div> : (
          <div className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="The SP310 outputs this stock in landscape orientation">
            Landscape
          </div>
        )}

        {/* Font Family Picker */}
        <div className="relative" ref={fontDropdownRef}>
          <button
            type="button"
            onClick={() => setFontPickerOpen(!fontPickerOpen)}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 w-36"
            title="Select Font Family"
          >
            <span className="truncate">{draft.preferredFontFamily}</span>
            <span className="text-[10px] text-slate-400">▼</span>
          </button>

          {fontPickerOpen && (
            <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <input
                type="text"
                value={fontSearchQuery}
                onChange={(e) => setFontSearchQuery(e.target.value)}
                placeholder="Search installed fonts..."
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                autoFocus
              />
              <div className="mt-2 max-h-48 overflow-y-auto">
                {filteredFonts.map((font) => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleFontSelect(font.family)}
                    className={`w-full text-left px-2 py-1 text-xs rounded truncate hover:bg-slate-100 dark:hover:bg-slate-700 ${
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
                  <div className="p-2 text-center text-xs text-slate-400">No matching fonts</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Font Size */}
        <div className="flex items-center gap-1">
          <label htmlFor="fontSizeInput" className="text-xs text-slate-500">
            Size:
          </label>
          <div className="flex items-center rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <input
              id="fontSizeInput"
              type="text"
              value={fontSizeDraft}
              onChange={(e) => setFontSizeDraft(e.target.value)}
              onBlur={(e) => handleFontSizeCommit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFontSizeCommit((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setFontSizeDraft(draft.fontSizePt.toString());
              }}
              className="w-12 px-1.5 py-1 text-center text-xs text-slate-800 focus:outline-none dark:bg-transparent dark:text-slate-200"
              title="Font point size (6 - 288)"
            />
            <span className="pr-1 text-[10px] text-slate-400">pt</span>
            <div className="flex flex-col border-l border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  stepFontSize(1);
                  updateProfilePreferences(activeProfile, { fontSizePt: Math.min(288, draft.fontSizePt + 1) });
                }}
                className="px-1 text-[9px] hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Increase 1 pt"
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
              >
                ▼
              </button>
            </div>
          </div>
        </div>

        {/* Alignment */}
        <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {(['left', 'center', 'right'] as Alignment[]).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => handleAlignmentChange(align)}
              className={`rounded px-2 py-1 text-xs capitalize transition-colors ${
                draft.alignment === align
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
              title={`Align ${align}`}
            >
              {align[0].toUpperCase()}
            </button>
          ))}
        </div>

        {/* Copies */}
        <div className="flex items-center gap-1">
          <label htmlFor="copiesInput" className="text-xs text-slate-500">
            Copies:
          </label>
          <div className="flex items-center rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <input
              id="copiesInput"
              type="text"
              value={copiesDraft}
              onChange={(e) => setCopiesDraft(e.target.value)}
              onBlur={(e) => handleCopiesCommit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCopiesCommit((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setCopiesDraft(draft.copies.toString());
              }}
              className="w-10 px-1 py-1 text-center text-xs text-slate-800 focus:outline-none dark:bg-transparent dark:text-slate-200"
              title="Number of copies (1 - 99)"
            />
            <div className="flex flex-col border-l border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setCopies(Math.min(99, draft.copies + 1))}
                className="px-1 text-[9px] hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Increase copies"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => setCopies(Math.max(1, draft.copies - 1))}
                className="px-1 text-[9px] hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Decrease copies"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Settings Button */}
        <button
          type="button"
          onClick={() => openDialog('settings')}
          className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          title="Printer & App Settings"
        >
          ⚙️
        </button>

        {/* Print Button */}
        <button
          type="button"
          onClick={onPrintClick}
          disabled={isPrintDisabled}
          className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors ${
            isPrintDisabled
              ? 'bg-slate-300 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
          title={`Print ${profileLabel} label (Ctrl+P / Cmd+P)`}
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
