import { codexHookEvents } from '../hook-source.js';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export type HookStatusSummary = { own: number; foreign: number; enabled: number; disabled: number;
  trusted: number; untrusted: number; modified: number; managed: number; errors: number; warnings: number };
/** Project isolated hooks/list only. Never retain source paths, commands, hashes or free text. */
export function summarizeHooks(value: unknown, expectedSource: string, expectedCommand: string): HookStatusSummary | undefined {
  if (!object(value) || !Array.isArray(value.data) || value.data.length > 8) return;
  const summary: HookStatusSummary = { own: 0, foreign: 0, enabled: 0, disabled: 0,
    trusted: 0, untrusted: 0, modified: 0, managed: 0, errors: 0, warnings: 0 };
  const events = new Set<string>(codexHookEvents.map(event => event[0]!.toLowerCase() + event.slice(1)));
  for (const entry of value.data) {
    if (!object(entry) || !Array.isArray(entry.hooks) || entry.hooks.length > 128 ||
      !Array.isArray(entry.errors) || entry.errors.length > 128 || !Array.isArray(entry.warnings) || entry.warnings.length > 128) return;
    summary.errors += entry.errors.length; summary.warnings += entry.warnings.length;
    for (const hook of entry.hooks) {
      if (!object(hook) || typeof hook.enabled !== 'boolean' || typeof hook.trustStatus !== 'string' ||
        !['trusted', 'untrusted', 'modified', 'managed'].includes(hook.trustStatus)) return;
      const sameSource = hook.sourcePath === expectedSource || (expectedSource.startsWith('/tmp/') && hook.sourcePath === '/private' + expectedSource);
      if (!sameSource || hook.command !== expectedCommand || hook.handlerType !== 'command' ||
        hook.source !== 'user' || typeof hook.eventName !== 'string' || !events.has(hook.eventName)) {
        summary.foreign++; continue;
      }
      summary.own++; summary[hook.enabled ? 'enabled' : 'disabled']++;
      summary[hook.trustStatus as 'trusted' | 'untrusted' | 'modified' | 'managed']++;
    }
  }
  return summary;
}
