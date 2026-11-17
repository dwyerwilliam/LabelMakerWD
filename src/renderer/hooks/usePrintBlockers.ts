import { useDeviceStore } from '../stores/deviceStore';
import { useLabelStore } from '../stores/labelStore';
import { useUIStore } from '../stores/uiStore';
import { parseCopiesInput, parseFontSizeInput } from '@shared/inputValidation';

export type PrintBlocker = 'no-text' | 'busy' | 'no-printer' | 'layout-pending' | 'invalid-font-size' | 'invalid-copies';

/**
 * Everything that must be fixed before a label can be sent. The toolbar button
 * and the Ctrl+P / Cmd+P shortcut both use this, so the shortcut can never print
 * when the button is disabled.
 */
export function usePrintBlockers(): PrintBlocker[] {
  const activeProfile = useLabelStore((s) => s.activeProfile);
  const text = useLabelStore((s) => s.draft.text);
  const draftRevision = useLabelStore((s) => s.draft.revision);
  const layoutRevision = useLabelStore((s) => s.layoutFingerprintRevision);
  const hasLayout = useLabelStore((s) => s.layoutFingerprint !== null);
  const hasQueue = useDeviceStore((s) => s.selectedQueues[activeProfile] !== null);
  const isBusy = useUIStore((s) => s.isPrintBusy);
  const fontSizeDraft = useUIStore((s) => s.fontSizeDraft);
  const copiesDraft = useUIStore((s) => s.copiesDraft);

  const blockers: PrintBlocker[] = [];
  if (text.trim().length === 0) blockers.push('no-text');
  if (isBusy) blockers.push('busy');
  if (!hasQueue) blockers.push('no-printer');
  if (!hasLayout || layoutRevision !== draftRevision) blockers.push('layout-pending');
  if (!parseFontSizeInput(fontSizeDraft).ok) blockers.push('invalid-font-size');
  if (!parseCopiesInput(copiesDraft).ok) blockers.push('invalid-copies');
  return blockers;
}
