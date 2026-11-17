import React, { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalFrameProps {
  /** Id of the element that names the dialog. */
  labelledBy: string;
  /** Id of the element that describes it (optional). */
  describedBy?: string;
  /** Called when the user presses Escape. */
  onEscape: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * The overlay and frame shared by every dialog: it announces itself as a modal
 * dialog, moves keyboard focus into it (to the element marked `data-autofocus`,
 * else the first control), keeps Tab inside it, closes on Escape, and puts focus
 * back where it was when it goes away.
 */
export const ModalFrame: React.FC<ModalFrameProps> = ({ labelledBy, describedBy, onEscape, className, children }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog).focus();

    return () => {
      // Back to the control that opened the dialog, if it is still there.
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onEscape();
      return;
    }

    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === firstEl || active === dialog)) {
      event.preventDefault();
      lastEl.focus();
    } else if (!event.shiftKey && active === lastEl) {
      event.preventDefault();
      firstEl.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={className}
      >
        {children}
      </div>
    </div>
  );
};
