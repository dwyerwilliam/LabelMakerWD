import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { PreferencesUpdate, PreferencesV2, SettingsProblem } from '@shared/contracts';
import { repairPreferences } from '@shared/preferencesRepair';
import { createDefaultPreferences } from '@shared/defaults';
import { legacyPreferencesV1Schema, preferencesV2Schema } from '@shared/schemas';

function clonePreferences(preferences: PreferencesV2): PreferencesV2 {
  return {
    schemaVersion: 2,
    activeProfile: preferences.activeProfile,
    profiles: {
      '4x6': { ...preferences.profiles['4x6'] },
      '2x1': { ...preferences.profiles['2x1'] },
    },
  };
}

export class SettingsService {
  private filePath: string;
  private currentPreferences: PreferencesV2 = createDefaultPreferences();
  private writePromise: Promise<void> = Promise.resolve();
  private freshInstall = false;
  private loadProblem: SettingsProblem | null = null;

  /** `filePath` is injectable for tests; the app always uses its per-user data directory. */
  constructor(filePath: string = path.join(app.getPath('userData'), 'settings.json')) {
    this.filePath = filePath;
    this.load();
  }

  /** True when this launch started without any settings file (first run, or settings were deleted). */
  isFreshInstall(): boolean {
    return this.freshInstall;
  }

  /** Set when the settings file could not be used as it was; shown to the user once at launch. */
  getLoadProblem(): SettingsProblem | null {
    return this.loadProblem;
  }

  getPreferences(): PreferencesV2 {
    return clonePreferences(this.currentPreferences);
  }

  load(): PreferencesV2 {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.freshInstall = true;
        this.currentPreferences = createDefaultPreferences();
        return this.getPreferences();
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const json: unknown = JSON.parse(raw);
      const parsedV2 = preferencesV2Schema.safeParse(json);

      if (parsedV2.success) {
        this.currentPreferences = parsedV2.data;
        return this.getPreferences();
      }

      // Preserve the existing SP410 settings when upgrading from the original v1 shape.
      const parsedV1 = legacyPreferencesV1Schema.safeParse(json);
      if (parsedV1.success) {
        const migrated = createDefaultPreferences();
        migrated.profiles['4x6'] = {
          orientation: parsedV1.data.orientation,
          fontFamily: parsedV1.data.fontFamily,
          fontSizePt: parsedV1.data.fontSizePt,
          alignment: parsedV1.data.alignment,
          printer: parsedV1.data.printer
            ? {
                deviceName: parsedV1.data.printer.deviceName,
                platform: parsedV1.data.printer.platform,
                identityFingerprint: parsedV1.data.printer.identityFingerprint,
                manualProfileConfirmed: parsedV1.data.printer.manualSp410Confirmed,
                usbConfirmed: parsedV1.data.printer.usbConfirmed,
              }
            : null,
        };
        this.currentPreferences = migrated;
        console.info('Migrated Label Maker settings from schema v1 to v2.');
        return this.getPreferences();
      }

      // A version 2 file with some invalid values keeps everything that is valid.
      const repair = repairPreferences(json);
      if (repair) {
        console.warn('Some settings were invalid and were reset to defaults:', repair.repaired);
        this.currentPreferences = repair.preferences;
        this.loadProblem = { kind: 'repaired', fields: repair.repaired, backupFile: this.backupCorrupt(raw) };
        return this.getPreferences();
      }

      const version = (json as { schemaVersion?: unknown } | null)?.schemaVersion;
      const newer = typeof version === 'number' && version > 2;
      console.warn(`Settings file is ${newer ? 'from a newer version' : 'invalid'}, saving a copy and loading defaults.`);
      this.loadProblem = { kind: newer ? 'newer' : 'corrupt', backupFile: this.backupCorrupt(raw) };
      this.currentPreferences = createDefaultPreferences();
    } catch (err) {
      console.error('Error reading settings file, restoring defaults:', err);
      let backupFile: string | undefined;
      try {
        if (fs.existsSync(this.filePath)) {
          const raw = fs.readFileSync(this.filePath, 'utf-8');
          backupFile = this.backupCorrupt(raw);
        }
      } catch {
        // Preserve the original load error; failure to create a backup is non-fatal.
      }
      this.loadProblem = { kind: 'corrupt', backupFile };
      this.currentPreferences = createDefaultPreferences();
    }

    return this.getPreferences();
  }

  /** Saves a copy of the settings that could not be used and returns its file name. */
  private backupCorrupt(content: string): string | undefined {
    try {
      const corruptPath = `${this.filePath}.corrupt.${Date.now()}`;
      fs.writeFileSync(corruptPath, content, 'utf-8');
      return path.basename(corruptPath);
    } catch (err) {
      console.error('Failed creating corrupt settings backup:', err);
      return undefined;
    }
  }

  update(partial: PreferencesUpdate): Promise<void> {
    this.currentPreferences = {
      ...this.currentPreferences,
      ...partial,
      schemaVersion: 2,
      profiles: partial.profiles
        ? {
            '4x6': { ...this.currentPreferences.profiles['4x6'], ...partial.profiles['4x6'] },
            '2x1': { ...this.currentPreferences.profiles['2x1'], ...partial.profiles['2x1'] },
          }
        : this.currentPreferences.profiles,
    };

    return this.flush();
  }

  reset(): Promise<PreferencesV2> {
    this.currentPreferences = createDefaultPreferences();
    return this.flush().then(() => this.getPreferences());
  }

  /**
   * Writes the current preferences. Writes are serialized, and each one runs
   * after the previous one settles *whether or not it succeeded*: a single
   * failed write (locked file, full disk) must not wedge every later save.
   * Each caller sees the result of its own write.
   */
  flush(): Promise<void> {
    const write = this.writePromise.catch(() => undefined).then(() => this.writeToDisk());
    this.writePromise = write;
    return write;
  }

  private async writeToDisk(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    const tempFile = path.join(dir, `settings.json.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`);
    const payload = JSON.stringify(this.currentPreferences, null, 2);

    try {
      await fs.promises.writeFile(tempFile, payload, 'utf-8');
      await fs.promises.rename(tempFile, this.filePath);
    } catch (error) {
      // Keep the previous settings file and do not leave temp files behind.
      await fs.promises.rm(tempFile, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
