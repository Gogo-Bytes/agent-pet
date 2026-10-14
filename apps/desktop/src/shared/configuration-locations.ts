import type { ConfigurationProvider } from './configurations.js';
import type { Inspection } from './pi-preflight.js';
export interface ConfigurationLocationsApi {
  choose(): Promise<string | null>;
  authorize(path: string): Promise<string | null>;
  inspect(path: string, provider: ConfigurationProvider): Promise<Inspection | null>;
}
