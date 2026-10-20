/** Metadata hints only; neither a signature nor an online/runtime version claim. */
export interface CodexInstallation {
  id: string; entryPath: string; executable: string;
  kind: 'standalone' | 'npm' | 'homebrew' | 'unknown';
  version: string | null;
  compatibility: 'verified' | 'unverified';
}
export interface CodexDiscoveryState {
  installations: CodexInstallation[]; targetPath: string;
  scan: 'complete' | 'limited'; notice: 'none' | 'busy' | 'failed' | 'cancelled';
}
