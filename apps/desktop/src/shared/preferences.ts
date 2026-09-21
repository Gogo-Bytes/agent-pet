export type Preferences = { schemaVersion: 1; petVisible: boolean; petSize: number };
export const defaultPreferences: Preferences = { schemaVersion: 1, petVisible: true, petSize: 140 };
export type PreferencePatch = Partial<Pick<Preferences, 'petVisible' | 'petSize'>>;
export type ManagementState = {
  preferences: Preferences;
  preferenceError: string | null;
  login: { supported: boolean; enabled: boolean; error: string | null };
};

export function parsePreferencePatch(value: unknown): PreferencePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid preferences');
  const patch = value as Record<string, unknown>;
  if (Object.keys(patch).some(key => key !== 'petVisible' && key !== 'petSize') ||
      ('petVisible' in patch && typeof patch.petVisible !== 'boolean') ||
      ('petSize' in patch && (typeof patch.petSize !== 'number' || !Number.isInteger(patch.petSize) || patch.petSize < 80 || patch.petSize > 600))) {
    throw new TypeError('Invalid preferences');
  }
  return patch as PreferencePatch;
}
