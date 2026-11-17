import { protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

export const APP_SCHEME = 'labelmaker';

export function registerAppProtocol(distPath: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    // Secure against path traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const fullPath = path.join(distPath, safePath);

    return net.fetch(pathToFileURL(fullPath).toString());
  });
}
