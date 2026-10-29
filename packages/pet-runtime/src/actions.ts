/** Trigger states/events, not clip names or prescribed gestures; Provider support varies. */
export const actionCatalogVersion = 1;
export const petActionCatalog = {
  idle: { label: '空闲时', playback: 'loop', fallback: [] },
  working: { label: '任务进行中', playback: 'loop', fallback: ['idle'] },
  thinking: { label: '正在思考', playback: 'loop', fallback: ['working', 'idle'] },
  responding: { label: '正在输出回答', playback: 'loop', fallback: ['working', 'idle'] },
  reading: { label: '正在读取文件', playback: 'loop', fallback: ['working', 'idle'] },
  writing: { label: '正在修改文件', playback: 'loop', fallback: ['working', 'idle'] },
  searching: { label: '正在搜索', playback: 'loop', fallback: ['working', 'idle'] },
  executing: { label: '正在执行命令', playback: 'loop', fallback: ['working', 'idle'] },
  compacting: { label: '正在压缩上下文', playback: 'loop', fallback: ['working', 'idle'] },
  waiting_input: { label: '等待输入', playback: 'loop', fallback: ['attention', 'idle'] },
  success: { label: '任务完成', playback: 'once', fallback: ['attention', 'idle'] },
  error: { label: '发生错误', playback: 'once', fallback: ['attention', 'idle'] },
  tool_error: { label: '工具执行失败', playback: 'once', fallback: ['attention', 'idle'] },
  retrying: { label: '正在重试', playback: 'loop', fallback: ['working', 'idle'] },
  output_limited: { label: '输出达到限制', playback: 'once', fallback: ['attention', 'idle'] },
  cancelled: { label: '任务已取消', playback: 'once', fallback: ['idle'] },
  attention: { label: '需要关注', playback: 'loop', fallback: ['idle'] },
  connected: { label: 'Agent 已连接', playback: 'once', fallback: ['idle'] },
  disconnected: { label: 'Agent 已断开', playback: 'loop', fallback: ['idle'] },
  hover: { label: '鼠标悬停时', playback: 'once', fallback: ['idle'] },
  selected: { label: '选中宠物时', playback: 'once', fallback: ['idle'] },
  dragging: { label: '被拖动', playback: 'loop', fallback: ['idle'] },
} as const;
export type PetAnimationTrigger = keyof typeof petActionCatalog;
/** Compatibility name for existing consumers; values identify triggers, not GLB clips. */
export type PetAction = PetAnimationTrigger;
/** Trigger -> exact GLB clip name; null means this trigger has no assigned animation. */
export type PetAnimations = Partial<Record<PetAnimationTrigger, string | null>>;
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
