export type Orientation = 'portrait' | 'landscape';
export type Alignment = 'left' | 'center' | 'right';
export type PrinterProfile = '4x6' | '2x1';

export interface ProfilePreferences {
  orientation: Orientation;
  fontFamily: string;
  fontSizePt: number;
  alignment: Alignment;
  printer: PrinterChoice | null;
}

export interface LabelDraft {
  revision: number;
  text: string;                 // LF newlines; tabs expanded to four spaces
  profile: PrinterProfile;
  orientation: Orientation;
  preferredFontFamily: string;
  resolvedFontFamily: string;   // actual family used in preview
  fontSizePt: number;
  alignment: Alignment;
  copies: number;               // session only
}

export interface PrinterChoice {
  deviceName: string;           // exact OS queue identifier, never display name
  platform: 'win32' | 'darwin';
  identityFingerprint: string;  // model/driver/port metadata when available
  manualProfileConfirmed: boolean;
  usbConfirmed: boolean;
}

export interface PreferencesV2 {
  schemaVersion: 2;
  activeProfile: PrinterProfile;
  profiles: Record<PrinterProfile, ProfilePreferences>;
}

export type PreferencesUpdate = Partial<Pick<PreferencesV2, 'activeProfile' | 'profiles'>>;

export interface LayoutFingerprint {
  logicalWidthPt: number;
  logicalHeightPt: number;
  lineRectsPt: Array<{ x: number; y: number; width: number; height: number }>;
  lineTextOffsets: number[];
  overflow: boolean;
}

export interface PrintSnapshot {
  requestId: string;
  draftRevision: number;
  text: string;
  profile: PrinterProfile;
  orientation: Orientation;
  resolvedFontFamily: string;
  fontSizePt: number;
  alignment: Alignment;
  copies: number;
  expectedLayout: LayoutFingerprint;
}

export type PrintState =
  | 'idle'
  | 'preparing'
  | 'awaiting-confirmation'
  | 'submitting'
  | 'submitted'
  | 'failed'
  | 'uncertain';

export type TransportType = 'usb' | 'bluetooth' | 'network' | 'unknown';
export type QueueStatus = 'ready' | 'offline' | 'paused' | 'error' | 'unknown';

export interface NormalizedQueue {
  displayName: string;
  deviceName: string;
  isDefault: boolean;
  model: string;
  driver: string;
  port: string;
  transport: TransportType;
  status: QueueStatus;
  paperDimensionsMm?: { width: number; height: number };
  hardMarginsMm?: { left: number; top: number; right: number; bottom: number };
  resolutionDpi?: { x: number; y: number };
  profile: PrinterProfile | null;
  requiresManualConfirmation: boolean;
  queryTimestamp: number;
}

export type ConfirmationReason = 'overflow_clipped' | 'printer_offline' | 'printer_unverified';

export interface PrintPrepareResult {
  token?: string;
  readyToSubmit: boolean;
  requiresConfirmation: boolean;
  confirmationReasons: ConfirmationReason[];
  warningMessage?: string;
  snapshot: PrintSnapshot;
}

export interface PrintStatusResult {
  requestId: string;
  state: PrintState;
  error?: string;
  detail?: string;
}

export interface FontItem {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}
