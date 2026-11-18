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

  it('keeps a future settings file byte-for-byte through edits and close until an explicit reset succeeds', async () => {
    const original = JSON.stringify({ schemaVersion: 3, anything: true });
    fs.writeFileSync(file, original, 'utf-8');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = new SettingsService(file);

    const problem = service.getLoadProblem();
    expect(problem?.kind).toBe('newer');
    expect(fs.readFileSync(path.join(dir, problem!.backupFile!), 'utf-8')).toContain('"schemaVersion":3');
    await service.update({ activeProfile: '2x1' });
    expect(service.getPreferences().activeProfile).toBe('2x1');
    await service.flush();
    expect(fs.readFileSync(file, 'utf-8')).toBe(original);

    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('locked'));
    await expect(service.reset()).rejects.toThrow('locked');
    expect(service.getPreferences().activeProfile).toBe('2x1');
    await service.flush();
    expect(fs.readFileSync(file, 'utf-8')).toBe(original);

    await service.reset();
    expect(service.getLoadProblem()).toBeNull();
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual(createDefaultPreferences());
    await service.update({ activeProfile: '2x1' });
    expect(new SettingsService(file).getPreferences().activeProfile).toBe('2x1');
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
  it('fills in default shipping-label settings for a file written before they existed', () => {
    const { shippingLabel: _omit, ...older } = createDefaultPreferences();
    older.profiles['4x6'].fontSizePt = 30;
    fs.writeFileSync(file, JSON.stringify(older), 'utf-8');

    const service = new SettingsService(file);
    expect(service.getLoadProblem()).toBeNull();
    expect(service.getPreferences().shippingLabel).toEqual(createDefaultPreferences().shippingLabel);
    expect(service.getPreferences().profiles['4x6'].fontSizePt).toBe(30);
  });

  it('saves shipping-label settings and reads them back', async () => {
    const service = new SettingsService(file);
    const shippingLabel = {
      mode4x6: 'image' as const,
      darkness: 5 as const,
      rememberedCrops: [
        { pageWidthPt: 612, pageHeightPt: 792, rect: { x: 0.05, y: 0.04, width: 0.48, height: 0.57 }, rotation: 0 as const },
      ],
    };
    await service.update({ shippingLabel });

    expect(new SettingsService(file).getPreferences().shippingLabel).toEqual(shippingLabel);
    // Other updates keep it.
    await service.update({ activeProfile: '2x1' });
    expect(new SettingsService(file).getPreferences().shippingLabel).toEqual(shippingLabel);
  });

  it('returns copies, so a caller cannot change the saved remembered crops', async () => {
    const service = new SettingsService(file);
    await service.update({
      shippingLabel: {
        mode4x6: 'text',
        darkness: 3,
        rememberedCrops: [{ pageWidthPt: 612, pageHeightPt: 792, rect: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0 }],
      },
    });
    const copy = service.getPreferences();
    copy.shippingLabel.rememberedCrops[0].rect.width = 0.1;
    copy.shippingLabel.rememberedCrops.push(copy.shippingLabel.rememberedCrops[0]);

    expect(service.getPreferences().shippingLabel.rememberedCrops).toHaveLength(1);
    expect(service.getPreferences().shippingLabel.rememberedCrops[0].rect.width).toBe(1);
  });

  it('resets invalid shipping-label settings and keeps everything else', () => {
    const prefs = createDefaultPreferences() as unknown as Record<string, any>;
    prefs.profiles['4x6'].fontFamily = 'Verdana';
    prefs.shippingLabel = { mode4x6: 'image', darkness: 9, rememberedCrops: [] };
    fs.writeFileSync(file, JSON.stringify(prefs), 'utf-8');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = new SettingsService(file);
    expect(service.getLoadProblem()).toMatchObject({ kind: 'repaired', fields: ['shippingLabel'] });
    expect(service.getPreferences().shippingLabel).toEqual(createDefaultPreferences().shippingLabel);
    expect(service.getPreferences().profiles['4x6'].fontFamily).toBe('Verdana');
  });

  it('resets shipping-label settings with Restore defaults', async () => {
    const service = new SettingsService(file);
    await service.update({ shippingLabel: { mode4x6: 'image', darkness: 1, rememberedCrops: [] } });
    const reset = await service.reset();
    expect(reset.shippingLabel).toEqual(createDefaultPreferences().shippingLabel);
  });
});
