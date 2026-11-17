import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLabelStore } from '../stores/labelStore';
import { LabelSurface } from '../label/LabelSurface';
import { calculateFitScale, getPageDimensions } from '../label/geometry';
import { measureLayoutFingerprint } from '../label/layout';
import { EditHistory } from '../editor/history';
import { normalizePlainText, sanitizePastedHtml } from '../editor/textModel';
import {
  getCaretCharacterOffsetWithin,
  setCaretCharacterOffsetWithin,
} from '../editor/selection';

export const LabelEditor: React.FC = () => {
  const { draft, setText, setLayoutFingerprint, overflow } = useLabelStore();
  const editorElRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<EditHistory>(new EditHistory(draft.text));

  const [scale, setScale] = useState(1.0);

  // ResizeObserver to scale preview while keeping exact physical aspect ratio
  useEffect(() => {
    if (!containerRef.current) return;

    const updateScale = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newScale = calculateFitScale(rect.width, rect.height, draft.orientation, 48);
      setScale(newScale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [draft.orientation]);

  // Measure layout and update fingerprint
  const runMeasurement = useCallback(() => {
    if (editorElRef.current) {
      const fingerprint = measureLayoutFingerprint(editorElRef.current, draft.orientation);
      setLayoutFingerprint(fingerprint);
    }
  }, [draft.orientation, setLayoutFingerprint]);

  useEffect(() => {
    runMeasurement();
  }, [draft.text, draft.orientation, draft.fontSizePt, draft.alignment, draft.preferredFontFamily, runMeasurement]);

  // Handle plain text input
  const handleInput = (rawText: string) => {
    const normalized = normalizePlainText(rawText);
    const caret = editorElRef.current
      ? getCaretCharacterOffsetWithin(editorElRef.current)
      : { start: normalized.length, end: normalized.length };

    historyRef.current.push(normalized, caret, 'type');
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
      const newText = normalizePlainText(editorElRef.current.innerText || editorElRef.current.textContent || '');
      const caret = getCaretCharacterOffsetWithin(editorElRef.current);
      historyRef.current.push(newText, caret, 'paste');
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

    // Tab key: insert 4 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '    ');
    }
  };

  const dims = getPageDimensions(draft.orientation);

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
    </div>
  );
};
