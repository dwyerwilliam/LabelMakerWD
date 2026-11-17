import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SettingsService } from '@main/services/settingsService';
import { createDefaultPreferences } from '@shared/defaults';

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

  it('migrates a version 1 settings file to the 4 x 6 profile', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        orientation: 'landscape',
        fontFamily: 'Verdana',
        fontSizePt: 30,
        alignment: 'left',
        printer: {
          deviceName: 'iDPRT SP410BT',
          platform: 'win32',
          identityFingerprint: ':iDPRT SP410BT:USB001',
          manualSp410Confirmed: true,
          usbConfirmed: true,
        },
      }),
      'utf-8'
    );
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const prefs = new SettingsService(file).getPreferences();

    expect(prefs.schemaVersion).toBe(2);
    expect(prefs.activeProfile).toBe('4x6');
    expect(prefs.profiles['4x6']).toMatchObject({
      orientation: 'landscape',
      fontFamily: 'Verdana',
      fontSizePt: 30,
      alignment: 'left',
      printer: { deviceName: 'iDPRT SP410BT', manualProfileConfirmed: true, usbConfirmed: true },
    });
    // The 2 x 1 profile keeps its own defaults.
    expect(prefs.profiles['2x1'].fontSizePt).toBe(12);
  });

  it('keeps valid values when only some settings are invalid, and reports what was reset', () => {
    const prefs = createDefaultPreferences();
    prefs.profiles['4x6'].fontFamily = 'Verdana';
    fs.writeFileSync(file, JSON.stringify({ ...prefs, profiles: { ...prefs.profiles, '2x1': { ...prefs.profiles['2x1'], fontSizePt: 1 } } }), 'utf-8');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = new SettingsService(file);

    expect(service.getPreferences().profiles['4x6'].fontFamily).toBe('Verdana');
    expect(service.getPreferences().profiles['2x1'].fontSizePt).toBe(12);
    const problem = service.getLoadProblem();
    expect(problem).toMatchObject({ kind: 'repaired', fields: ['2x1.fontSizePt'] });
    expect(fs.existsSync(path.join(dir, problem!.backupFile!))).toBe(true);
  });

  it('reports no problem for a good file, a missing file, and a migrated version 1 file', () => {
    expect(new SettingsService(file).getLoadProblem()).toBeNull();
    fs.writeFileSync(file, JSON.stringify(createDefaultPreferences()), 'utf-8');
    expect(new SettingsService(file).getLoadProblem()).toBeNull();
  });

  it('reports a file from a newer version without losing it', () => {
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 3, anything: true }), 'utf-8');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = new SettingsService(file);

    const problem = service.getLoadProblem();
    expect(problem?.kind).toBe('newer');
    expect(fs.readFileSync(path.join(dir, problem!.backupFile!), 'utf-8')).toContain('"schemaVersion":3');
  });

  it('reports unreadable settings as corrupt, with the copy that was saved', () => {
    fs.writeFileSync(file, '{ not json', 'utf-8');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const problem = new SettingsService(file).getLoadProblem();
    expect(problem?.kind).toBe('corrupt');
    expect(problem?.backupFile).toMatch(/^settings\.json\.corrupt\.\d+$/);
  });

  it('backs up a corrupt settings file and falls back to defaults', () => {
    fs.writeFileSync(file, '{ not json', 'utf-8');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const service = new SettingsService(file);

    expect(service.getPreferences().activeProfile).toBe('4x6');
    expect(fs.readdirSync(dir).some((name) => name.startsWith('settings.json.corrupt.'))).toBe(true);
  });
});
