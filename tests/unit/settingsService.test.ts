import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SettingsService } from '@main/services/settingsService';

// The service only touches Electron to find the default settings path, and
// these tests always pass an explicit path.
vi.mock('electron', () => ({ app: { getPath: () => '' } }));

describe('SettingsService persistence', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labelmaker-settings-'));
    file = path.join(dir, 'settings.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes preferences and reloads them without leaving temp files', async () => {
    const service = new SettingsService(file);
    await service.update({ activeProfile: '2x1' });

    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).activeProfile).toBe('2x1');
    expect(new SettingsService(file).getPreferences().activeProfile).toBe('2x1');
    expect(fs.readdirSync(dir)).toEqual(['settings.json']);
  });

  it('keeps saving after a failed write instead of rejecting every later save', async () => {
    const service = new SettingsService(file);
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('EBUSY: file is locked'));

    await expect(service.update({ activeProfile: '2x1' })).rejects.toThrow('EBUSY');
    // The failed attempt leaves no temp file and no settings file behind.
    expect(fs.readdirSync(dir)).toEqual([]);

    await expect(service.update({ activeProfile: '4x6' })).resolves.toBeUndefined();
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).activeProfile).toBe('4x6');
  });

  it('lets a write queued behind a failing write still succeed', async () => {
    const service = new SettingsService(file);
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('EBUSY: file is locked'));

    const first = service.update({ activeProfile: '2x1' });
    const second = service.update({ activeProfile: '4x6' });

    await expect(first).rejects.toThrow('EBUSY');
    await expect(second).resolves.toBeUndefined();
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).activeProfile).toBe('4x6');
  });

  it('backs up a corrupt settings file and falls back to defaults', () => {
    fs.writeFileSync(file, '{ not json', 'utf-8');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const service = new SettingsService(file);

    expect(service.getPreferences().activeProfile).toBe('4x6');
    expect(fs.readdirSync(dir).some((name) => name.startsWith('settings.json.corrupt.'))).toBe(true);
  });
});
