import type { NormalizedQueue, PrinterChoice, PrinterProfile, TransportType } from './contracts';

/** Model/driver/port metadata used to notice when a queue is no longer the one the user confirmed. */
export function queueIdentityFingerprint(queue: Pick<NormalizedQueue, 'model' | 'driver' | 'port'>): string {
  return `${queue.model}:${queue.driver}:${queue.port}`;
}

/** Bluetooth and network queues are out of scope; only USB (or user-confirmed USB) queues may print. */
export function isUnsupportedTransport(transport: TransportType): boolean {
  return transport === 'bluetooth' || transport === 'network';
}

/**
 * Re-applies the user's saved choice to a fresh scan. A queue the user
 * confirmed by hand stays confirmed only while its model/driver/port
 * fingerprint is unchanged; otherwise the confirmation is void.
 */
function resolveSavedQueue(
  queues: NormalizedQueue[],
  profile: PrinterProfile,
  saved: PrinterChoice | null
): NormalizedQueue | null {
  if (!saved) return null;

  const queue = queues.find((candidate) => candidate.deviceName === saved.deviceName);
  if (!queue || isUnsupportedTransport(queue.transport)) return null;

  const confirmed = saved.usbConfirmed && saved.identityFingerprint === queueIdentityFingerprint(queue);

  if (queue.profile === profile) {
    return confirmed ? { ...queue, requiresManualConfirmation: false } : queue;
  }

  // A renamed queue the user explicitly assigned to this profile.
  if (queue.profile === null && saved.manualProfileConfirmed && confirmed) {
    return { ...queue, profile, requiresManualConfirmation: false };
  }

  return null;
}

export interface QueueSelection {
  queue: NormalizedQueue | null;
  /**
   * The user chose a printer for this profile earlier, but it cannot be used now
   * (it is gone, or its identity or connection could not be confirmed). The
   * choice is kept for when the printer returns, and no other printer is
   * substituted silently: the user is asked to choose again.
   */
  savedProblem: { deviceName: string; kind: 'missing' | 'unusable' } | null;
}

/**
 * Picks the queue to use for a profile: the saved choice if it is still
 * present and verified; with no saved choice, the first auto-detected USB queue
 * for the profile. Never the OS default printer, and never a different printer
 * than the one the user chose. Shared by main (which prints) and the renderer
 * (which enables Print) so both always agree.
 */
export function resolveQueueSelection(
  queues: NormalizedQueue[],
  profile: PrinterProfile,
  saved: PrinterChoice | null
): QueueSelection {
  if (saved) {
    const savedQueue = resolveSavedQueue(queues, profile, saved);
    if (savedQueue && !savedQueue.requiresManualConfirmation) {
      return { queue: savedQueue, savedProblem: null };
    }
    const present = queues.some((queue) => queue.deviceName === saved.deviceName);
    return { queue: null, savedProblem: { deviceName: saved.deviceName, kind: present ? 'unusable' : 'missing' } };
  }

  const detected = queues.find((queue) => queue.profile === profile && !queue.requiresManualConfirmation) ?? null;
  return { queue: detected, savedProblem: null };
}

export function selectQueueForProfile(
  queues: NormalizedQueue[],
  profile: PrinterProfile,
  saved: PrinterChoice | null
): NormalizedQueue | null {
  return resolveQueueSelection(queues, profile, saved).queue;
}
