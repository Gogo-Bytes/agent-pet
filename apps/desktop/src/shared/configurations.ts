import type { PiConnectionState } from './pi-connection.js';
import type { Inspection, InstallationCandidate } from './pi-preflight.js';

export const configurationProviders = ['pi', 'codex', 'claude', 'opencode', 'gemini', 'cursor'] as const;
export type ConfigurationProvider = typeof configurationProviders[number];
export interface PetBinding { assetId: 'starter'; name: string }
/** Non-secret metadata. Availability, peer connection, and task observations have separate owners. */
export interface ConfigurationMetadata {
  id: string;
  name: string;
  provider: ConfigurationProvider;
  targetPath: string;
  installation: InstallationCandidate | null;
  pet: PetBinding | null;
}
export interface AgentConfiguration extends ConfigurationMetadata {
  availability: 'unchecked' | 'available' | 'attention' | 'unsupported';
  inspection: Inspection | null;
  connection: PiConnectionState | null;
}
export type ConfigurationNotice = 'none' | 'invalid' | 'duplicate' | 'not-found' | 'busy' |
  'save-failed' | 'saved-invalid' | 'withdraw-first' | 'retained' | 'unsupported' | 'limit';
export interface ConfigurationsState {
  revision: number;
  records: AgentConfiguration[];
  notice: ConfigurationNotice;
  busy: boolean;
  /** Application session id -> configuration id. No tokens, endpoints or transcript data. */
  sessionConfigurations: Record<string, string>;
}
export interface CreateConfiguration {
  name: string;
  provider: ConfigurationProvider;
  targetPath: string;
  installation?: InstallationCandidate | null;
}
export interface ConfigurationsApi {
  getState(): Promise<ConfigurationsState>;
  create(input: CreateConfiguration): Promise<ConfigurationsState>;
  prepareDetected(installationId: string, requestId: string): Promise<DetectedSetupResult>;
  cancelDetected(requestId: string): Promise<void>;
  rename(id: string, name: string): Promise<ConfigurationsState>;
  changeTarget(id: string, path: string): Promise<ConfigurationsState>;
  bindPet(id: string, pet: PetBinding | null): Promise<ConfigurationsState>;
  inspect(id: string): Promise<ConfigurationsState>;
  preview(id: string): Promise<ConfigurationsState>;
  cancel(id: string): Promise<ConfigurationsState>;
  confirm(id: string, planId: string): Promise<ConfigurationsState>;
  resume(id: string): Promise<ConfigurationsState>;
  disable(id: string): Promise<ConfigurationsState>;
  remove(id: string): Promise<ConfigurationsState>;
  subscribe(listener: (state: ConfigurationsState) => void): () => void;
}
export interface DetectedSetupResult { state: ConfigurationsState; configurationId: string | null; reason?: 'cancelled' | 'timeout' }
