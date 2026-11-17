import { describe, it, expect } from 'vitest';
import { repairPreferences } from '@shared/preferencesRepair';
import { createDefaultPreferences } from '@shared/defaults';

function validFile() {
  const prefs = createDefaultPreferences();
  prefs.profiles['4x6'].fontFamily = 'Verdana';
  prefs.profiles['4x6'].fontSizePt = 30;
  prefs.profiles['2x1'].alignment = 'left';
  return prefs;
}

describe('repairPreferences', () => {
  it('returns null for anything that is not a version 2 settings object', () => {
    expect(repairPreferences(null)).toBeNull();
    expect(repairPreferences('text')).toBeNull();
    expect(repairPreferences([])).toBeNull();
    expect(repairPreferences({ schemaVersion: 1 })).toBeNull();
    expect(repairPreferences({ schemaVersion: 3 })).toBeNull();
  });

  it('leaves a fully valid file unchanged', () => {
    const file = validFile();
    const result = repairPreferences(file)!;
    expect(result.repaired).toEqual([]);
    expect(result.preferences).toEqual(file);
  });

  it('resets only the invalid values and keeps the rest', () => {
    const file = validFile() as unknown as Record<string, any>;
    file.profiles['4x6'].fontSizePt = 7.3; // not a half-point step
    file.profiles['2x1'].orientation = 'diagonal';
    file.profiles['2x1'].alignment = 'left'; // valid, must survive

    const { preferences, repaired } = repairPreferences(file)!;

    expect(repaired.sort()).toEqual(['2x1.orientation', '4x6.fontSizePt']);
    expect(preferences.profiles['4x6'].fontSizePt).toBe(24); // default
    expect(preferences.profiles['4x6'].fontFamily).toBe('Verdana'); // kept
    expect(preferences.profiles['2x1'].orientation).toBe('landscape'); // default
    expect(preferences.profiles['2x1'].alignment).toBe('left'); // kept
  });

  it('resets an invalid saved printer without touching the formatting beside it', () => {
    const file = validFile() as unknown as Record<string, any>;
    file.profiles['4x6'].printer = { deviceName: '', platform: 'linux' };

    const { preferences, repaired } = repairPreferences(file)!;
    expect(repaired).toEqual(['4x6.printer']);
    expect(preferences.profiles['4x6'].printer).toBeNull();
    expect(preferences.profiles['4x6'].fontFamily).toBe('Verdana');
  });

  it('ignores unknown keys and treats a missing printer as none chosen', () => {
    const file = validFile() as unknown as Record<string, any>;
    file.somethingNew = true;
    file.profiles['4x6'].extra = 1;
    delete file.profiles['4x6'].printer;

    const result = repairPreferences(file)!;
    expect(result.repaired).toEqual([]);
    expect(result.preferences.profiles['4x6'].printer).toBeNull();
  });

  it('resets a missing or invalid active profile and a missing profile block', () => {
    const file = validFile() as unknown as Record<string, any>;
    file.activeProfile = 'huge';
    delete file.profiles['2x1'];

    const { preferences, repaired } = repairPreferences(file)!;
    expect(repaired).toContain('activeProfile');
    expect(repaired).toContain('2x1');
    expect(preferences.activeProfile).toBe('4x6');
    expect(preferences.profiles['2x1']).toEqual(createDefaultPreferences().profiles['2x1']);
    expect(preferences.profiles['4x6'].fontFamily).toBe('Verdana');
  });
});
