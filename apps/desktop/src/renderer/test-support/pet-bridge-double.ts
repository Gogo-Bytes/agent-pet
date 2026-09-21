import { vi } from 'vitest';
import { createApplication } from '@agent-pet/application';
import type { OpenSessionResult, SessionRef } from '@agent-pet/adapter-core';
import type { SessionObservation, SessionState } from '@agent-pet/domain';
import type { OverlayLayout } from '../../main/overlay-layout.js';
import { baselineLayout } from './pi-fixtures.js';

type Options = {
  observations?: readonly SessionObservation[];
  layout?: OverlayLayout;
  openSession?: (session: SessionRef) => Promise<OpenSessionResult>;
};

// Test-only renderer seam. Application owns unread/rename semantics; this is not
// an Electron or DOM simulator. Movement records commands, not OS window moves.
export function createPetBridgeDouble(options: Options = {}) {
  const application = createApplication([{
    provider: 'pi', start: vi.fn(),
    openSession: options.openSession ?? (async () => ({ status: 'unsupported' })),
  }]);
  for (const observation of options.observations ?? []) application.observe(observation);
  const snapshotListeners = new Set<(snapshot: SessionState) => void>();
  const layoutListeners = new Set<(layout: OverlayLayout) => void>();
  let layout = options.layout ?? baselineLayout();
  const unsubscribe = application.subscribe(snapshot => {
    for (const listener of snapshotListeners) listener(snapshot);
  });
  const api = {
    acknowledgeAndOpen: vi.fn((session: SessionRef) => application.acknowledgeAndOpen(session)),
    requestSnapshot: vi.fn(async () => {
      for (const listener of snapshotListeners) listener(application.snapshot());
      for (const listener of layoutListeners) listener(layout);
    }),
    subscribeSnapshot: vi.fn((listener: (snapshot: SessionState) => void) => {
      const registration = (snapshot: SessionState) => listener(snapshot);
      snapshotListeners.add(registration);
      return () => { snapshotListeners.delete(registration); };
    }),
    subscribeLayout: vi.fn((listener: (value: OverlayLayout) => void) => {
      const registration = (value: OverlayLayout) => listener(value);
      layoutListeners.add(registration);
      return () => { layoutListeners.delete(registration); };
    }),
    bubblesExpanded: vi.fn(async (_expanded: boolean) => {}),
    bubblesVisible: vi.fn(async (_visible: boolean) => {}),
    interaction: vi.fn(async (_active: boolean) => {}),
    moveWindowBy: vi.fn(async (_delta: { x: number; y: number }) => {}),
    resizeWindowBy: vi.fn(async (_delta: { x: number; y: number }) => {}),
  } satisfies Window['pet'];
  return {
    api,
    observe: (observation: SessionObservation) => application.observe(observation),
    snapshot: () => application.snapshot(),
    publishLayout(value: OverlayLayout) {
      layout = value;
      for (const listener of layoutListeners) listener(layout);
    },
    listenerCounts: () => ({ snapshot: snapshotListeners.size, layout: layoutListeners.size }),
    dispose() { unsubscribe(); snapshotListeners.clear(); layoutListeners.clear(); },
  };
}
