// How shipping labels get in: Ctrl+V / Cmd+V, drag and drop, the file picker and the Paste
// button. See SHIPPING_LABEL_TECHNICAL_SPEC.md §10. The listeners are registered once (App);
// the toolbar and the shipping view reach the actions through ShippingInputContext.
//
// This hook never switches tabs or modes itself: loadBlob does that once a file has been read,
// so a file that cannot be opened changes nothing.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { ACCEPT_ATTRIBUTE, classifyFile } from '../shipping/fileTypes';
import { selectEffectiveContentMode, useLabelStore } from '../stores/labelStore';
import { MESSAGES, useShippingStore } from '../stores/shippingStore';
import { useUIStore } from '../stores/uiStore';

export interface ShippingInputActions {
  openFilePicker: () => void;
  pasteFromSystemClipboard: () => Promise<void>;
}

export const ShippingInputContext = createContext<ShippingInputActions>({
  openFilePicker: () => undefined,
  pasteFromSystemClipboard: () => Promise.resolve(),
});

export function useShippingActions(): ShippingInputActions {
  return useContext(ShippingInputContext);
}

const NO_CLIPBOARD_IMAGE_WIN = 'No image on the clipboard. Take a screen snip first (Win+Shift+S).';
const NO_CLIPBOARD_IMAGE_MAC = 'No image on the clipboard. Take a screen snip first (Cmd+Ctrl+Shift+4).';
const CLIPBOARD_HAS_TEXT = 'The clipboard has text, not an image. Switch to Text to paste text.';

/** Paste and drop do nothing while a dialog is open or a label is being sent. */
function inputBlocked(): boolean {
  const ui = useUIStore.getState();
  return ui.activeDialog !== 'none' || ui.isPrintBusy;
}

export interface PickedFile {
  file: File | null;
  total: number;
  unsupported: File | null;
}

/** The first supported file in a paste or drop, else a clipboard image item. */
export function pickSupportedFile(dt: DataTransfer | null): PickedFile {
  if (!dt) return { file: null, total: 0, unsupported: null };
  const files = Array.from(dt.files ?? []);
  const supported = files.find((f) => classifyFile(f.name, f.type) !== null) ?? null;
  // Snipping tools put a bitmap on the clipboard as an item, not always as a file.
  if (!supported) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return { file: f, total: Math.max(files.length, 1), unsupported: null };
      }
    }
  }
  return { file: supported, total: files.length, unsupported: supported ? null : (files[0] ?? null) };
}

/** Starts loading a pasted file: images count as clipboard snips, PDFs keep their name. */
export function loadPastedFile(file: File): void {
  const isPdf = classifyFile(file.name, file.type) === 'pdf';
  void useShippingStore.getState().loadBlob(file, isPdf ? file.name : null, isPdf ? 'file' : 'clipboard');
}

function isLabelEditor(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="textbox"][aria-label="Label text editor"]') !== null;
}

function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).includes('Files');
}

export function useShippingInput(): { actions: ShippingInputActions; fileInput: React.ReactElement } {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (inputBlocked()) return;
      const effective = selectEffectiveContentMode(useLabelStore.getState());
      // The text editor handles its own paste (plain text wins; an image-only paste is handed back here).
      if (effective === 'text' && isLabelEditor(e.target)) return;

      const { file } = pickSupportedFile(e.clipboardData);
      if (file) {
        e.preventDefault();
        loadPastedFile(file);
        return;
      }
      // Text pasted into a field (copies, font search, settings) is that field's business.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (effective === 'image' && text.trim() !== '') {
        useUIStore.getState().setShippingMessage({ kind: 'info', text: CLIPBOARD_HAS_TEXT });
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      // Without this, Chromium does not fire `drop`, and would open the file in the window.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = inputBlocked() ? 'none' : 'copy';
      if (!useUIStore.getState().dragActive) useUIStore.getState().setDragActive(true);
    };

    const onDragLeave = (e: DragEvent) => {
      // relatedTarget is null when the pointer leaves the window.
      if (e.relatedTarget === null) useUIStore.getState().setDragActive(false);
    };

    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return; // text drops keep their normal behavior
      e.preventDefault(); // never let the window open the file
      const ui = useUIStore.getState();
      ui.setDragActive(false);
      if (inputBlocked()) return;

      const { file, total, unsupported } = pickSupportedFile(e.dataTransfer);
      if (!file) {
        const message = MESSAGES.unsupported(unsupported?.name ?? 'that file');
        if (selectEffectiveContentMode(useLabelStore.getState()) === 'image') ui.setShippingMessage({ kind: 'error', text: message });
        else ui.setNotice(message);
        return;
      }
      if (total > 1) ui.setNotice(`Only one file at a time. Using ${file.name}.`);
      void useShippingStore.getState().loadBlob(file, file.name, 'file');
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const openFilePicker = useCallback(() => {
    if (inputBlocked() || !fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }, []);

  const pasteFromSystemClipboard = useCallback(async () => {
    if (inputBlocked() || !window.api) return;
    let bytes: Uint8Array | null;
    try {
      bytes = await window.api.clipboard.readImage();
    } catch {
      bytes = null;
    }
    if (!bytes) {
      const mac = navigator.platform.toUpperCase().includes('MAC');
      const text = mac ? NO_CLIPBOARD_IMAGE_MAC : NO_CLIPBOARD_IMAGE_WIN;
      if (selectEffectiveContentMode(useLabelStore.getState()) === 'image') {
        useUIStore.getState().setShippingMessage({ kind: 'error', text });
      } else {
        useUIStore.getState().setNotice(text);
      }
      return;
    }
    await useShippingStore.getState().loadBlob(new Blob([bytes as BlobPart], { type: 'image/png' }), null, 'clipboard');
  }, []);

  const actions = useMemo(() => ({ openFilePicker, pasteFromSystemClipboard }), [openFilePicker, pasteFromSystemClipboard]);

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPT_ATTRIBUTE}
      hidden
      aria-hidden="true"
      tabIndex={-1}
      data-testid="shipping-file-input"
      onChange={(e) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        // Cleared at once, so choosing the same file again still counts as a change.
        input.value = '';
        if (file) void useShippingStore.getState().loadBlob(file, file.name, 'file');
      }}
    />
  );

  return { actions, fileInput };
}
