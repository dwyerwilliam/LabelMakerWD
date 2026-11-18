import type { PreferencesV2 } from './contracts';
import { createDefaultPreferences, PRINTER_PROFILES } from './defaults';
import { printerProfileSchema, profilePreferencesSchema, shippingLabelPreferencesSchema } from './schemas';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface RepairResult {
  preferences: PreferencesV2;
  /** Which settings were invalid or missing and were reset to their defaults, e.g. `4x6.fontSizePt`. */
  repaired: string[];
}

/**
 * For a settings file that is version 2 but has some invalid values: keeps every
 * value that is valid and resets only the ones that are not, so one bad entry
 * does not throw away the rest. Unknown keys are ignored. Returns null when the
 * data is not a version 2 settings object at all.
 */
export function repairPreferences(json: unknown): RepairResult | null {
  if (!isRecord(json) || json.schemaVersion !== 2) return null;

  const defaults = createDefaultPreferences();
  const repaired: string[] = [];

  const activeProfile = printerProfileSchema.safeParse(json.activeProfile);
  if (activeProfile.success) defaults.activeProfile = activeProfile.data;
  else repaired.push('activeProfile');

  const rawProfiles = isRecord(json.profiles) ? json.profiles : {};
  if (!isRecord(json.profiles)) repaired.push('profiles');

  const shape = profilePreferencesSchema.shape;
  for (const profile of PRINTER_PROFILES) {
    const raw = isRecord(rawProfiles[profile]) ? rawProfiles[profile] : {};
    if (!isRecord(rawProfiles[profile]) && isRecord(json.profiles)) repaired.push(profile);

    const target = defaults.profiles[profile];
    for (const key of ['orientation', 'fontFamily', 'fontSizePt', 'alignment'] as const) {
      const parsed = shape[key].safeParse(raw[key]);
      if (parsed.success) (target as unknown as Record<string, unknown>)[key] = parsed.data;
      else repaired.push(`${profile}.${key}`);
    }

    // A missing printer entry simply means none was chosen.
    if (raw.printer !== undefined) {
      const printer = shape.printer.safeParse(raw.printer);
      if (printer.success) target.printer = printer.data;
      else repaired.push(`${profile}.printer`);
    }
  }

  // A missing shippingLabel entry is an older file, not damage: the default stays.
  if (json.shippingLabel !== undefined) {
    const shipping = shippingLabelPreferencesSchema.safeParse(json.shippingLabel);
    if (shipping.success) defaults.shippingLabel = shipping.data;
    else repaired.push('shippingLabel');
  }

  return { preferences: defaults, repaired };
}
