/** Public connection metadata only; no activation, native IDs or original hook contents. */
export interface CodexConnectionState {
  revision: number;
  status: 'not-configured' | 'waiting' | 'observing' | 'disabled' | 'failed';
  busy: boolean;
  configured: boolean;
  observedSessions: number;
  canConfigure: boolean;
  canResume: boolean;
  notice: 'none' | 'unsupported-installation' | 'preview-failed' | 'stale-preview' | 'save-failed' | 'saved-invalid' | 'retained';
  preview: { id: string; executable: string; path: string; canApply: boolean; exists: boolean; events: readonly string[] } | null;
}
