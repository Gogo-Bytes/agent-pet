import { createApplication } from '@agent-pet/application';
import type { SessionState } from '@agent-pet/domain';
import type { OverlayLayout } from '../../shared/overlay-layout.js';
import { baselineLayout, piBaselineObservations, piObservation } from './pi-fixtures.js';

// Dev-only page: exercises the real Renderer without connecting to a user's pi socket.
// Native movement, resizing and hit testing are intentionally not simulated.
const application = createApplication([{
  provider: 'pi', start: async () => ({ stop: async () => {} }),
  openSession: async () => ({ status: 'unsupported' }),
}]);
const params = new URLSearchParams(location.search);
const motion = params.get('motion');
const observations = motion === 'idle' ? []
  : motion === 'working' ? [piObservation({ status: 'working' })]
  : motion === 'success' ? [piObservation({ status: 'completed' })]
  : motion === 'error' ? [piObservation({ status: 'error' })] : piBaselineObservations();
for (const observation of observations) application.observe(observation);
const snapshots = new Set<(value: SessionState) => void>();
const layouts = new Set<(value: OverlayLayout) => void>();
const position = params.get('position') === 'bottom-right' ? 'bottom-right'
  : params.get('position') === 'top-left' ? 'top-left' : 'center';
const layout = baselineLayout(position, params.get('size') === '80' ? 80 : params.get('size') === '300' ? 300 : params.get('size') === '600' ? 600 : 140);
const unsubscribe = application.subscribe(value => { for (const listener of snapshots) listener(value); });
window.pet = {
  acknowledgeAndOpen: session => application.acknowledgeAndOpen(session),
  requestSnapshot: async () => {
    for (const listener of snapshots) listener(application.snapshot());
    for (const listener of layouts) listener(layout);
  },
  subscribeSnapshot: listener => {
    const wrapped = (value: SessionState) => listener(value);
    snapshots.add(wrapped);
    return () => { snapshots.delete(wrapped); };
  },
  subscribeLayout: listener => {
    const wrapped = (value: OverlayLayout) => listener(value);
    layouts.add(wrapped);
    return () => { layouts.delete(wrapped); };
  },
  bubblesExpanded: async () => {}, bubblesVisible: async () => {},
  interaction: async () => {}, moveWindowBy: async () => {}, resizeWindowBy: async () => {},
};
window.addEventListener('beforeunload', unsubscribe, { once: true });
await import('../main.js');
document.body.style.background = params.get('theme') === 'dark' ? '#111827' : '#f1f5f9';
