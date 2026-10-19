/** Inert, additive documents only. Never install, trust hooks or merge existing configuration here. */
export const codexHookEvents = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse',
  'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'PreCompact', 'PostCompact'] as const;
export function createCodexHookDocument(nodeExecutable: string, observerPath: string): string {
  const quote = (value: string) => {
    if (!value.startsWith('/') || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value))
      throw new Error('An absolute executable and observer path are required');
    return `'${value.replaceAll("'", "'\"'\"'")}'`;
  };
  const command = `${quote(nodeExecutable)} ${quote(observerPath)}`;
  return JSON.stringify({ hooks: Object.fromEntries(codexHookEvents.map(event => [event,
    [{ hooks: [{ type: 'command', command, timeout: 2 }] }]])) }, null, 2);
}
