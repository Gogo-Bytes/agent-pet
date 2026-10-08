import { vi } from 'vitest';
import type { PiConnectionState } from '../../shared/pi-connection.js';
export const initialConnection: PiConnectionState = {
  revision: 0, status: 'not-configured', mode: 'desktop', busy: false, canConfigure: true,
  preview: null, deployedPath: null, canRemove: false, notice: 'none',
};
export function connectionBridge() {
  let listener: ((state: PiConnectionState) => void) | undefined;
  const bridge = {
    getState: vi.fn(async () => initialConnection),
    preview: vi.fn(async () => initialConnection),
    cancel: vi.fn(async () => initialConnection),
    confirm: vi.fn(async (_id: string) => initialConnection),
    remove: vi.fn(async () => initialConnection),
    subscribe: vi.fn((callback: (state: PiConnectionState) => void) => { listener = callback; return () => { listener = undefined; }; }),
  };
  return { ...bridge, push: (state: PiConnectionState) => listener?.(state) };
}
