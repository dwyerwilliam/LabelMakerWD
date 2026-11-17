import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { Alignment, Orientation, PrinterProfile } from '@shared/contracts';
import { serializeEditableText } from '../editor/textModel';
import './label.css';

export interface LabelSurfaceProps {
  text: string;
  profile?: PrinterProfile;
  orientation: Orientation;
  fontFamily: string;
  fontSizePt: number;
  alignment: Alignment;
  isEditing?: boolean;
  isPrintMode?: boolean;
  overflow?: boolean;
  onInput?: (text: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
}

export const LabelSurface = forwardRef<HTMLDivElement, LabelSurfaceProps>(
  (
    {
      text,
      profile = '4x6',
      orientation,
      fontFamily,
      fontSizePt,
      alignment,
      isEditing = false,
      isPrintMode = false,
      overflow = false,
      onInput,
      onKeyDown,
      onPaste,
      onBlur,
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const isSmallLandscape = profile === '2x1';
    const isPortrait = !isSmallLandscape && orientation === 'portrait';
    const isEmpty = text.length === 0;

    useImperativeHandle(ref, () => editorRef.current!, []);

    // Keep the live editor synchronized when text changes externally, while
    // leaving the active caret-owned DOM alone during normal typing.
    useLayoutEffect(() => {
      if (!isEditing || !editorRef.current || document.activeElement === editorRef.current) return;

      const currentText = serializeEditableText(editorRef.current);
      if (currentText !== text) {
        editorRef.current.textContent = text;
      }
    }, [isEditing, text]);

    const textStyle: React.CSSProperties = {
      fontFamily: `"${fontFamily}", sans-serif`,
      fontSize: `${fontSizePt}pt`,
      lineHeight: 1.2,
      textAlign: alignment,
    };

    const safeAreaClass = [
      'label-safe-area',
      isSmallLandscape
        ? 'label-safe-area-2x1'
        : isPortrait ? 'label-safe-area-portrait' : 'label-safe-area-landscape',
      overflow ? 'has-overflow' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const safeAreaStyle: React.CSSProperties = {
      justifyContent: overflow ? 'flex-start' : 'center',
    };

    const textContainerClass = [
      'label-text-container',
      `align-${alignment}`,
      !isPrintMode && isEmpty ? 'label-placeholder' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const content = (
      <div className={safeAreaClass} style={safeAreaStyle}>
        <div
          ref={editorRef}
          className={textContainerClass}
          style={textStyle}
          // "plaintext-only" makes Enter insert a newline character instead of a <div>,
          // and keeps rich content (pasted, dropped or typed with shortcuts) out of the label.
          contentEditable={isEditing ? 'plaintext-only' : false}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Label text editor"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onInput={(e) => {
            if (onInput) {
              onInput(serializeEditableText(e.currentTarget));
            }
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={onBlur}
        >
          {!isEditing ? text : undefined}
        </div>
      </div>
    );

    if (isSmallLandscape) {
      return (
        <div
          className={`label-sheet-2x1 ${!isPrintMode ? 'preview-mode' : ''}`}
          data-profile="2x1"
          data-orientation="landscape"
        >
          {content}
        </div>
      );
    }

    if (isPortrait) {
      return (
        <div
          className={`label-sheet-portrait ${!isPrintMode ? 'preview-mode' : ''}`}
          data-profile="4x6"
          data-orientation="portrait"
        >
          {content}
        </div>
      );
    }

    if (isPrintMode) {
      // Printing targets portrait 4 × 6 stock. Rotate the logical landscape
      // composition only in the hidden print renderer.
      return (
        <div
          className="label-sheet-landscape label-sheet-landscape-physical"
          data-profile="4x6"
          data-orientation="landscape"
        >
          <div className="label-landscape-rotation-wrapper">{content}</div>
        </div>
      );
    }

    // Editing stays horizontal so the text remains upright and easy to edit.
    return (
      <div
        className="label-sheet-landscape preview-mode"
        data-profile="4x6"
        data-orientation="landscape"
      >
        {content}
      </div>
    );
  }
);

LabelSurface.displayName = 'LabelSurface';
