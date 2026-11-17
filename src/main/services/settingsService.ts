import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { PreferencesUpdate, PreferencesV2 } from '@shared/contracts';
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

  /** `filePath` is injectable for tests; the app always uses its per-user data directory. */
  constructor(filePath: string = path.join(app.getPath('userData'), 'settings.json')) {
    this.filePath = filePath;
    this.load();
  }

  getPreferences(): PreferencesV2 {
    return clonePreferences(this.currentPreferences);
  }

  load(): PreferencesV2 {
    try {
      if (!fs.existsSync(this.filePath)) {
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

      console.warn('Invalid settings schema, backing up corrupt file and loading defaults:', parsedV2.error);
      this.backupCorrupt(raw);
      this.currentPreferences = createDefaultPreferences();
    } catch (err) {
      console.error('Error reading settings file, restoring defaults:', err);
      try {
        if (fs.existsSync(this.filePath)) {
          const raw = fs.readFileSync(this.filePath, 'utf-8');
          this.backupCorrupt(raw);
        }
      } catch {
        // Preserve the original load error; failure to create a backup is non-fatal.
      }
      this.currentPreferences = createDefaultPreferences();
    }

    return this.getPreferences();
  }

  private backupCorrupt(content: string): void {
    try {
      const corruptPath = `${this.filePath}.corrupt.${Date.now()}`;
      fs.writeFileSync(corruptPath, content, 'utf-8');
    } catch (err) {
      console.error('Failed creating corrupt settings backup:', err);
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
