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

/**
 * Picks the queue to use for a profile: the saved choice if it is still
 * present and verified, otherwise the first auto-detected USB queue for the
 * profile. Never the OS default printer. Shared by main (which prints) and the
 * renderer (which enables Print) so both always agree.
 */
export function selectQueueForProfile(
  queues: NormalizedQueue[],
  profile: PrinterProfile,
  saved: PrinterChoice | null
): NormalizedQueue | null {
  const savedQueue = resolveSavedQueue(queues, profile, saved);
  if (savedQueue && !savedQueue.requiresManualConfirmation) return savedQueue;

  return queues.find((queue) => queue.profile === profile && !queue.requiresManualConfirmation) ?? null;
}
