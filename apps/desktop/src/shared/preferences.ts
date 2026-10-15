/** Non-secret application preferences. Agent configurations and assets live separately. */
export type Preferences = {
  schemaVersion: 2;
  petVisible: boolean;
  /** Desktop pet anchor in CSS pixels; 140 is the 100% default. */
  petSize: number;
  petName: string;
  fps: 30 | 60 | 120;
  resolution: 75 | 100 | 150;
  pauseHidden: boolean;
  tray: boolean;
  dock: boolean;
  startConsole: boolean;
  background: boolean;
  offline: boolean;
  /** Legacy stored preference; desktop overlay no longer renders a name label. */
  names: boolean;
  topmost: boolean;
  bubbles: boolean;
  reduced: boolean;
  completed: boolean;
  error: boolean;
};
export const defaultPreferences: Preferences = {
  schemaVersion: 2, petVisible: true, petSize: 140, petName: '小伙伴',
  fps: 60, resolution: 100, pauseHidden: true,
  tray: true, dock: true, startConsole: false, background: true,
  offline: true, names: true, topmost: true, bubbles: true, reduced: false,
  completed: true, error: true,
};
export type PreferencePatch = Partial<Omit<Preferences, 'schemaVersion'>>;
export type ManagementState = {
  preferences: Preferences;
  preferenceError: string | null;
  login: { supported: boolean; enabled: boolean; error: string | null };
};
const booleanKeys = ['petVisible', 'pauseHidden', 'tray', 'dock', 'startConsole', 'background',
  'offline', 'names', 'topmost', 'bubbles', 'reduced', 'completed', 'error'] as const;
const allowedKeys = new Set<string>([...booleanKeys, 'petSize', 'petName', 'fps', 'resolution']);
export function parsePreferencePatch(value: unknown): PreferencePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid preferences');
  const patch = value as Record<string, unknown>;
  if (Object.keys(patch).some(key => !allowedKeys.has(key)) ||
      booleanKeys.some(key => key in patch && typeof patch[key] !== 'boolean') ||
      ('petSize' in patch && (typeof patch.petSize !== 'number' || !Number.isInteger(patch.petSize) || patch.petSize < 80 || patch.petSize > 600)) ||
      ('petName' in patch && (typeof patch.petName !== 'string' || !patch.petName.trim() || patch.petName.trim().length > 40)) ||
      ('fps' in patch && ![30, 60, 120].includes(patch.fps as number)) ||
      ('resolution' in patch && ![75, 100, 150].includes(patch.resolution as number))) {
    throw new TypeError('Invalid preferences');
  }
  return { ...patch, ...('petName' in patch ? { petName: (patch.petName as string).trim() } : {}) } as PreferencePatch;
}
export function validatePreferences(value: Preferences): Preferences {
  if (!value.tray && !value.dock) throw new TypeError('至少保留菜单栏或 Dock 中的一个应用入口。');
  return value;
}
/** Version 1 migration is read-only until an explicit preference change is saved. */
export function parseStoredPreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid preference schema');
  const parsed = value as Record<string, unknown>;
  const { schemaVersion, ...patch } = parsed;
  if (schemaVersion === 1) {
    if (Object.keys(patch).length !== 2 || !('petVisible' in patch) || !('petSize' in patch)) throw new TypeError('Invalid preference schema');
  } else if (schemaVersion === 2) {
    if (Object.keys(patch).length !== allowedKeys.size || [...allowedKeys].some(key => !(key in patch))) throw new TypeError('Invalid preference schema');
  } else throw new TypeError('Invalid preference schema');
  return validatePreferences({ ...defaultPreferences, ...parsePreferencePatch(patch) });
}
