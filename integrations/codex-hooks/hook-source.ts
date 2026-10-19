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

/** Ordinary invocation: discovery is an explicit private file, never a shell-exported capability. */
export function createCodexNormalHookDocument(nodeExecutable: string, observerPath: string, activationPath: string, runAsNode = false): string {
  const base = JSON.parse(createCodexHookDocument(nodeExecutable, observerPath)) as {
    hooks: Record<string, { hooks: { command: string }[] }[]>;
  };
  if (!activationPath.startsWith('/') || activationPath.length > 4096 || /[\u0000-\u001f\u007f]/u.test(activationPath))
    throw new Error('An absolute activation path is required');
  const quoted = `'${activationPath.replaceAll("'", "'\"'\"'")}'`;
  for (const groups of Object.values(base.hooks)) for (const group of groups) for (const hook of group.hooks)
    hook.command = `${runAsNode ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}${hook.command} ${quoted}`;
  return JSON.stringify(base, null, 2);
}
