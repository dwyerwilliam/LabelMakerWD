import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLabelStore } from '../stores/labelStore';
import { LabelSurface } from '../label/LabelSurface';
import { calculateFitScale, getPageDimensions } from '../label/geometry';
import { measureLayoutFingerprint } from '../label/layout';
import { EditHistory } from '../editor/history';
import { normalizePlainText, sanitizePastedHtml, serializeEditableText } from '../editor/textModel';
import {
  getCaretCharacterOffsetWithin,
  setCaretCharacterOffsetWithin,
} from '../editor/selection';

export const LabelEditor: React.FC = () => {
  const { draft, setText, setLayoutFingerprint, overflow } = useLabelStore();
  const editorElRef = useRef<HTMLDivElement>(null);
  const measurementElRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<EditHistory>(new EditHistory(draft.text));
  // Flag: when true, the next draft.text change came from user input (typing/paste)
  // so we must NOT overwrite the DOM (which would destroy the caret position).
  const isUserInputRef = useRef(false);

  const [scale, setScale] = useState(1.0);

  // ResizeObserver to scale preview while keeping exact physical aspect ratio
  useEffect(() => {
    if (!containerRef.current) return;

    const updateScale = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newScale = calculateFitScale(rect.width, rect.height, draft.profile, draft.orientation, 48);
      setScale(newScale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [draft.profile, draft.orientation]);

  // Synchronize DOM text with draft.text only when changed externally (undo/redo/reset).
  // When the change came from the user typing or pasting, skip — the DOM already has
  // the correct text and overwriting it would destroy the caret position.
  useEffect(() => {
    if (isUserInputRef.current) {
      isUserInputRef.current = false;
      return;
    }
    if (editorElRef.current) {
      const domText = normalizePlainText(serializeEditableText(editorElRef.current));
      if (domText !== draft.text) {
        editorElRef.current.textContent = draft.text;
      }
    }
  }, [draft.text]);

  // Measure layout and update fingerprint
  const runMeasurement = useCallback(() => {
    // Measure an offscreen non-editable mirror that uses the same DOM/CSS
    // structure as the print renderer. The live contenteditable can contain
    // browser-generated div/br nodes for multiline input, which are not a
    // reliable source for print geometry.
    const measurementElement = measurementElRef.current || editorElRef.current;
    if (measurementElement) {
      const fingerprint = measureLayoutFingerprint(
        measurementElement,
        draft.profile,
        draft.orientation,
        draft.profile === '4x6' && draft.orientation === 'landscape'
      );
      setLayoutFingerprint(fingerprint, draft.revision);
    }
  }, [draft.profile, draft.orientation, draft.revision, setLayoutFingerprint]);

  useEffect(() => {
    runMeasurement();
  }, [draft.text, draft.profile, draft.orientation, draft.fontSizePt, draft.alignment, draft.preferredFontFamily, runMeasurement]);

  // Handle plain text input
  const handleInput = (rawText: string) => {
    const element = editorElRef.current;
    const normalized = normalizePlainText(rawText);
    let caret = element
      ? getCaretCharacterOffsetWithin(element)
      : { start: normalized.length, end: normalized.length };

    if (element && normalized !== rawText) {
      // Text arrived with tabs or CR characters (a drop, voice input, ...). Show
      // exactly what will print, and keep the caret where it was in that text.
      const end = normalizePlainText(rawText.slice(0, caret.end)).length;
      element.textContent = normalized;
      setCaretCharacterOffsetWithin(element, end);
      caret = { start: end, end };
    }

    historyRef.current.push(normalized, caret, 'type');
    isUserInputRef.current = true;
    setText(normalized);
  };

  // Intercept paste to ensure only clean plain text is inserted
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const plain = e.clipboardData.getData('text/plain');
    const html = e.clipboardData.getData('text/html');

    const clean = plain ? normalizePlainText(plain) : sanitizePastedHtml(html);
    if (!clean) return;

    // Insert clean text at caret
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(clean);
    range.insertNode(textNode);

    // Advance caret after inserted text
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    if (editorElRef.current) {
      const newText = normalizePlainText(serializeEditableText(editorElRef.current));
      const caret = getCaretCharacterOffsetWithin(editorElRef.current);
      historyRef.current.push(newText, caret, 'paste');
      isUserInputRef.current = true;
      setText(newText);
    }
  };

  // Keyboard navigation & custom undo/redo
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    if (modKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        // Redo
        const entry = historyRef.current.redo();
        if (entry) {
          setText(entry.text);
          if (editorElRef.current) {
            editorElRef.current.textContent = entry.text;
            setCaretCharacterOffsetWithin(editorElRef.current, entry.selection.end);
          }
        }
      } else {
        // Undo
        const entry = historyRef.current.undo();
        if (entry) {
          setText(entry.text);
          if (editorElRef.current) {
            editorElRef.current.textContent = entry.text;
            setCaretCharacterOffsetWithin(editorElRef.current, entry.selection.end);
          }
        }
      }
      return;
    }

    if (modKey && e.key.toLowerCase() === 'y' && !isMac) {
      // Windows Ctrl+Y Redo
      e.preventDefault();
      const entry = historyRef.current.redo();
      if (entry) {
        setText(entry.text);
        if (editorElRef.current) {
          editorElRef.current.textContent = entry.text;
          setCaretCharacterOffsetWithin(editorElRef.current, entry.selection.end);
        }
      }
      return;
    }

    // Tab and Shift+Tab are left alone so keyboard users can leave the editor (a label has no
    // use for tab stops; typed or pasted tabs are turned into spaces).
  };

  const dims = getPageDimensions(draft.profile, draft.orientation);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      {/* Overflow Warning Banner */}
      {overflow && (
        <div className="flex items-center justify-between bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md animate-pulse">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>Text doesn't fit. Reduce the font size or shorten the text.</span>
          </div>
        </div>
      )}

      {/* A saved font that is not installed is replaced; say so before anything prints. */}
      {draft.resolvedFontFamily !== draft.preferredFontFamily && (
        <div role="status" className="flex items-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white shadow-md">
          <span>⚠️</span>
          <span>
            The font "{draft.preferredFontFamily}" is not installed on this computer. This label will print in "
            {draft.resolvedFontFamily}" instead. Choose another font to change it.
          </span>
        </div>
      )}

      {/* Main Preview Work Area */}
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center overflow-hidden p-6"
      >
        <div
          style={{
            width: `${dims.widthPx}px`,
            height: `${dims.heightPx}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          }}
          className="relative bg-white"
        >
          <LabelSurface
            ref={editorElRef}
            text={draft.text}
            profile={draft.profile}
            orientation={draft.orientation}
            fontFamily={draft.resolvedFontFamily}
            fontSizePt={draft.fontSizePt}
            alignment={draft.alignment}
            isEditing={true}
            overflow={overflow}
            onInput={handleInput}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          pointerEvents: 'none',
        }}
      >
        <LabelSurface
          ref={measurementElRef}
          text={draft.text}
          profile={draft.profile}
          orientation={draft.orientation}
          fontFamily={draft.resolvedFontFamily}
          fontSizePt={draft.fontSizePt}
          alignment={draft.alignment}
          isPrintMode={true}
          overflow={overflow}
        />
      </div>
    </div>
  );
};
