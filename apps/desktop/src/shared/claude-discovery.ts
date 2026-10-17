/** Installation facts only; no settings, hook contents, receiver credentials or process data. */
export interface ClaudeInstallation {
  id: string;
  entryPath: string;
  executable: string;
  kind: 'npm' | 'native' | 'homebrew' | 'unknown';
  version: string | null;
  compatibility: 'verified' | 'unverified';
}
export interface ClaudeDiscoveryState {
  installations: ClaudeInstallation[];
  targetPath: string;
  scan: 'complete' | 'limited';
  notice: 'none' | 'busy' | 'failed' | 'cancelled';
}
