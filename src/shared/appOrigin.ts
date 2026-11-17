/** The custom scheme the packaged app is served from: labelmaker://app/... */
export const APP_SCHEME = 'labelmaker';
export const APP_HOST = 'app';

/** Where the Vite dev server serves the app. Only trusted when the app is not packaged. */
export const DEV_ORIGINS = ['http://127.0.0.1:15174', 'http://localhost:15174'] as const;

/**
 * Whether a URL belongs to the app itself. Parsed, not matched by prefix, so
 * look-alikes such as `labelmaker://app.evil/` or `labelmaker://app@evil/` do not pass.
 */
export function isAppUrl(url: string | undefined | null, allowDevOrigin: boolean): boolean {
  if (!url) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol === `${APP_SCHEME}:`) {
    return parsed.hostname === APP_HOST && parsed.username === '' && parsed.password === '' && parsed.port === '';
  }

  return allowDevOrigin && (DEV_ORIGINS as readonly string[]).includes(parsed.origin);
}
