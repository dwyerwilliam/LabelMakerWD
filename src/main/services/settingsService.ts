import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { PreferencesV1 } from '@shared/contracts';
import { DEFAULT_PREFERENCES } from '@shared/defaults';
import { preferencesV1Schema } from '@shared/schemas';

export class SettingsService {
  private filePath: string;
  private currentPreferences: PreferencesV1 = DEFAULT_PREFERENCES;
  private pendingTimer: NodeJS.Timeout | null = null;
  private revision = 0;
  private writePromise: Promise<void> = Promise.resolve();

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'settings.json');
    this.load();
  }

  getPreferences(): PreferencesV1 {
    return { ...this.currentPreferences };
  }

  load(): PreferencesV1 {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.currentPreferences = { ...DEFAULT_PREFERENCES };
        return this.currentPreferences;
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const json = JSON.parse(raw);
      const parsed = preferencesV1Schema.safeParse(json);

      if (parsed.success) {
        this.currentPreferences = parsed.data;
      } else {
        console.warn('Invalid settings schema, backing up corrupt file and loading defaults:', parsed.error);
        this.backupCorrupt(raw);
        this.currentPreferences = { ...DEFAULT_PREFERENCES };
      }
    } catch (err) {
      console.error('Error reading settings file, restoring defaults:', err);
      try {
        if (fs.existsSync(this.filePath)) {
          const raw = fs.readFileSync(this.filePath, 'utf-8');
          this.backupCorrupt(raw);
        }
      } catch {}
      this.currentPreferences = { ...DEFAULT_PREFERENCES };
    }

    return this.currentPreferences;
  }

  private backupCorrupt(content: string): void {
    try {
      const corruptPath = `${this.filePath}.corrupt.${Date.now()}`;
      fs.writeFileSync(corruptPath, content, 'utf-8');
    } catch (err) {
      console.error('Failed creating corrupt settings backup:', err);
    }
  }

  update(partial: Partial<PreferencesV1>): Promise<void> {
    this.revision++;
    this.currentPreferences = {
      ...this.currentPreferences,
      ...partial,
      schemaVersion: 1,
    };

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
    }

    return new Promise((resolve, reject) => {
      this.pendingTimer = setTimeout(async () => {
        try {
          await this.flush();
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 250);
    });
  }

  reset(): Promise<PreferencesV1> {
    this.currentPreferences = { ...DEFAULT_PREFERENCES };
    return this.flush().then(() => this.getPreferences());
  }

  flush(): Promise<void> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    this.writePromise = this.writePromise.then(async () => {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempFile = path.join(dir, `settings.json.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`);
      const payload = JSON.stringify(this.currentPreferences, null, 2);

      await fs.promises.writeFile(tempFile, payload, 'utf-8');
      await fs.promises.rename(tempFile, this.filePath);
    });

    return this.writePromise;
  }
}
