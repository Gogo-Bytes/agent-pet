/** Inert native plugin documents. No installation, settings merge, credential or launch.
 * Hook compatibility must be verified against the selected CLI before activation.
 */
export function createClaudePluginDocuments(nodeExecutable: string, options: { runAsNode?: boolean } = {}): { manifest: string; hooks: string } {
  if (!nodeExecutable.startsWith('/') || nodeExecutable.length > 4096 || /[\u0000-\u001f\u007f]/u.test(nodeExecutable)) {
    throw new Error('An absolute Node executable is required');
  }
  const quotedNode = `'${nodeExecutable.replaceAll("'", "'\"'\"'")}'`;
  const command = `${options.runAsNode ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}${quotedNode} "\${CLAUDE_PLUGIN_ROOT}/runtime/hook.cjs"`;
  const events = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
    'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'PreCompact', 'PostCompact'];
  return {
    manifest: JSON.stringify({ name: 'agent-pet-observer', version: '0.1.0',
      description: 'Observe Agent status without controlling tasks', author: { name: 'Agent Pet' } }, null, 2),
    hooks: JSON.stringify({ hooks: Object.fromEntries(events.map(event => [event,
      [{ hooks: [{ type: 'command', command, timeout: 2 }] }]])) }, null, 2),
  };
}
