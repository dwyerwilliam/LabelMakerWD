/**
 * Electron wraps an error thrown in the main process as
 * "Error invoking remote method 'channel': Error: <message>". Users should
 * only see the message.
 */
export function describeIpcError(error: unknown, fallback = 'Unknown error'): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const cleaned = message.replace(/^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/, '').trim();
  return cleaned || fallback;
}
