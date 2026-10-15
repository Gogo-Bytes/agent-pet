/** Presentation vocabulary, not a claim that a Provider emits every signal. */
export const actionCatalogVersion = 1;
export const petActionCatalog = {
  idle: { label: '待机', playback: 'loop', fallback: [] },
  working: { label: '工作', playback: 'loop', fallback: ['idle'] },
  thinking: { label: '思考', playback: 'loop', fallback: ['working', 'idle'] },
  responding: { label: '回答', playback: 'loop', fallback: ['working', 'idle'] },
  reading: { label: '阅读', playback: 'loop', fallback: ['working', 'idle'] },
  writing: { label: '写作', playback: 'loop', fallback: ['working', 'idle'] },
  searching: { label: '查找', playback: 'loop', fallback: ['working', 'idle'] },
  executing: { label: '执行', playback: 'loop', fallback: ['working', 'idle'] },
  compacting: { label: '整理', playback: 'loop', fallback: ['working', 'idle'] },
  waiting_input: { label: '等你操作', playback: 'loop', fallback: ['attention', 'idle'] },
  success: { label: '庆祝', playback: 'once', fallback: ['attention', 'idle'] },
  error: { label: '出错', playback: 'once', fallback: ['attention', 'idle'] },
  tool_error: { label: '遇到问题', playback: 'once', fallback: ['attention', 'idle'] },
  retrying: { label: '再试一次', playback: 'loop', fallback: ['working', 'idle'] },
  output_limited: { label: '回答中断', playback: 'once', fallback: ['attention', 'idle'] },
  cancelled: { label: '停下', playback: 'once', fallback: ['idle'] },
  attention: { label: '提醒', playback: 'loop', fallback: ['idle'] },
  connected: { label: '欢迎', playback: 'once', fallback: ['idle'] },
  disconnected: { label: '寻找连接', playback: 'loop', fallback: ['idle'] },
  hover: { label: '看向你', playback: 'once', fallback: ['idle'] },
  selected: { label: '回应点击', playback: 'once', fallback: ['idle'] },
  dragging: { label: '被拖动', playback: 'loop', fallback: ['idle'] },
  sleeping: { label: '睡觉', playback: 'loop', fallback: ['idle'] },
} as const;
export type PetAction = keyof typeof petActionCatalog;
export type PetAnimations = Partial<Record<PetAction, string | null>>;
export const petActionIds = Object.keys(petActionCatalog) as PetAction[];
export const bundledAnimations: PetAnimations = { idle: 'Idle', working: 'Work', success: 'Success', error: 'Error' };

/** Accept the former four bundled clip IDs at the existing management seam. */
export function normalizePetAction(value: string): PetAction | undefined {
  if (Object.hasOwn(petActionCatalog, value)) return value as PetAction;
  const legacy: Record<string, PetAction> = { Idle: 'idle', Work: 'working', Success: 'success', Error: 'error' };
  return Object.hasOwn(legacy, value) ? legacy[value] : undefined;
}
export type ResolvedPetAnimation = { action: PetAction; clip: string; playback: 'loop' | 'once' };
export function resolvePetAnimation(request: string, mappings: PetAnimations | undefined, clips: readonly string[]): ResolvedPetAnimation | null {
  const action = normalizePetAction(request);
  // An unknown request is a static pose, never a guessed business outcome.
  if (!action || !mappings) return null;
  const names = new Set(clips);
  for (const candidate of [action, ...petActionCatalog[action].fallback]) {
    const clip = Object.hasOwn(mappings, candidate) ? mappings[candidate] : undefined;
    if (typeof clip === 'string' && clip.trim() && names.has(clip)) {
      return { action: candidate, clip, playback: petActionCatalog[candidate].playback };
    }
  }
  return null;
}

/** Always generated from the complete vocabulary; every slot is optional. */
export function createPetArtistTemplate() {
  return { schemaVersion: 2 as const, actionCatalogVersion, id: 'my-pet', version: '1.0.0',
    model: 'pet.glb', license: '', animations: Object.fromEntries(petActionIds.map(id => [id, null])) as PetAnimations };
}
export function availablePetActions(mappings: PetAnimations | undefined, clips: readonly string[]): PetAction[] {
  return petActionIds.filter(id => resolvePetAnimation(id, mappings, clips)?.action === id);
}
