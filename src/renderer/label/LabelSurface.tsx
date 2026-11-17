import React, { forwardRef } from 'react';
import type { Alignment, Orientation } from '@shared/contracts';
import './label.css';

export interface LabelSurfaceProps {
  text: string;
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
    const isPortrait = orientation === 'portrait';
    const isEmpty = text.length === 0;

    const textStyle: React.CSSProperties = {
      fontFamily: `"${fontFamily}", sans-serif`,
      fontSize: `${fontSizePt}pt`,
      lineHeight: 1.2,
      textAlign: alignment,
    };

    const safeAreaClass = [
      'label-safe-area',
      isPortrait ? 'label-safe-area-portrait' : 'label-safe-area-landscape',
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
          ref={ref}
          className={textContainerClass}
          style={textStyle}
          contentEditable={isEditing}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Label text editor"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onInput={(e) => {
            if (onInput) {
              const target = e.currentTarget;
              onInput(target.innerText || target.textContent || '');
            }
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={onBlur}
        >
          {text}
        </div>
      </div>
    );

    if (isPortrait) {
      return (
        <div
          className={`label-sheet-portrait ${!isPrintMode ? 'preview-mode' : ''}`}
          data-orientation="portrait"
        >
          {content}
        </div>
      );
    }

    // Landscape orientation: rotate 90deg clockwise into 4x6 portrait stock
    return (
      <div
        className={`label-sheet-landscape ${!isPrintMode ? 'preview-mode' : ''}`}
        data-orientation="landscape"
      >
        <div className="label-landscape-rotation-wrapper">
          {content}
        </div>
      </div>
    );
  }
);

LabelSurface.displayName = 'LabelSurface';
