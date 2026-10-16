/** Public metadata only. Receiver URLs, tokens and activation contents never cross IPC. */
export interface ClaudeConnectionPreview {
  id: string;
  executable: string;
  directory: string;
  files: readonly string[];
  settings?: { path: string; exists: boolean; canApply: boolean; reason: string };
}
export interface ClaudeConnectionState {
  revision: number;
  scope: 'presence-only';
  mode?: 'normal-start' | 'legacy-launcher';
  status: 'not-configured' | 'waiting' | 'observing' | 'disconnected' | 'disabled' | 'failed';
  busy: boolean;
  configured: boolean;
  observedRuns: number;
  launchers: number;
  preview: ClaudeConnectionPreview | null;
  launchCommand: string | null;
  canConfigure: boolean;
  canResume: boolean;
  notice: 'none' | 'choose-executable' | 'unsupported-installation' | 'preview-failed' | 'stale-preview' |
    'save-failed' | 'start-failed' | 'resume-required' | 'retained' | 'disabled' | 'disconnected' | 'saved-invalid';
}
