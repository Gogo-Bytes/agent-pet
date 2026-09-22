import { vi } from 'vitest';
import type { PreflightState } from '../../shared/pi-preflight.js';
export const initialPreflight: PreflightState = {
  revision: 0, installations: [], selectedInstallation: null,
  target: { path: '/synthetic/.pi/agent', source: 'default' }, inspection: null, scan: 'not-run', notice: 'none',
};
export function preflightBridge() {
  return {
    getState: vi.fn(async () => initialPreflight), detect: vi.fn(async () => initialPreflight),
    chooseInstallation: vi.fn(async () => initialPreflight), selectInstallation: vi.fn(async (_id: string) => initialPreflight),
    chooseTarget: vi.fn(async () => initialPreflight), useDefaultTarget: vi.fn(async () => initialPreflight),
    inspect: vi.fn(async () => initialPreflight),
  };
}
