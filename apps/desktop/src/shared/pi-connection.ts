import type { Finding, TargetCandidate } from './pi-preflight.js';

export interface PiDeploymentPreview {
  id: string;
  target: TargetCandidate;
  path: string;
  action: 'create' | 'blocked';
  findings: readonly Finding[];
  createDirectories: readonly string[];
}
export interface PiConnectionState {
  revision: number;
  status: 'not-configured' | 'configured-waiting' | 'connected' | 'disconnected' | 'failed';
  mode: 'desktop' | 'development-env';
  busy: boolean;
  canConfigure: boolean;
  preview: PiDeploymentPreview | null;
  deployedPath: string | null;
  canRemove: boolean;
  notice: 'none' | 'choose-target' | 'busy' | 'invalid-plan' | 'preview-failed' | 'stale-plan' |
    'deploy-failed-preserved' | 'start-failed' | 'runtime-failed' | 'removed' | 'retained-changed' |
    'retained-unknown' | 'failed-preserved' | 'stopped';
}
export interface PiConnectionApi {
  getState(): Promise<PiConnectionState>;
  preview(): Promise<PiConnectionState>;
  cancel(): Promise<PiConnectionState>;
  confirm(id: string): Promise<PiConnectionState>;
  remove(): Promise<PiConnectionState>;
  subscribe(listener: (state: PiConnectionState) => void): () => void;
}
