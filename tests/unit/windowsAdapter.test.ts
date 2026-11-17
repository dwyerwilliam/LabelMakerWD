import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { inspectWindowsPrinter } from '@main/platform/windowsAdapter';

vi.mock('electron', () => ({ app: { getAppPath: () => '' } }));

// These start PowerShell, so they only run on Windows.
describe.runIf(process.platform === 'win32')('inspectWindowsPrinter with unusual queue names', () => {
  it('never runs commands hidden in a queue name (typographic quotes end a PowerShell string too)', async () => {
    const marker = path.join(os.tmpdir(), `labelmaker-injection-${process.pid}-${Date.now()}.txt`);
    // Closes the quoted name with a curly quote, runs a command, then opens a new quoted name so the script stays valid.
    // (The payload avoids ASCII quotes, which the old escaping doubled; backticks escape spaces in the path.)
    const name = `a’; New-Item -Path ${marker.replace(/ /g, '`` ')} -ItemType File; Get-Printer -Name ‘b`;

    try {
      await inspectWindowsPrinter(name, '4x6');
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      fs.rmSync(marker, { force: true });
    }
  }, 40_000);

  it('handles a queue name with apostrophes and quotes without failing', async () => {
    const result = await inspectWindowsPrinter(`Bob's "Label" Printer ’`, '2x1');
    // No such queue exists, so nothing can be read about it: the state stays unknown.
    expect(result.status).toBe('unknown');
  }, 40_000);
});
