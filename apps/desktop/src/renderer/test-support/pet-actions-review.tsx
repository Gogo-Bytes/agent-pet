// Test-only host: real production player and GLB, no Agent or Electron bridge.
import { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { projectPetPresentation, resolvePetAnimation, bundledAnimations, petActionCatalog, petActionIds, type PetAnimations, type PetAction } from '@agent-pet/pet-runtime';
import { applyObservation, createSessionState, type ActivityKind, type OccurrenceKind } from '@agent-pet/domain';
import { ScenePet } from '../management/ScenePet.js';
const cases: Record<string, PetAnimations> = {
  '内置四种动画': bundledAnimations, '全部静态': {}, '只有工作，无待机': { working: 'Work' },
  '只有庆祝，无待机': { success: 'Success' }, '引用不存在的动画': { idle: 'Missing', error: 'Missing' },
};
function Review() {
  const [asset, setAsset] = useState('内置四种动画');
  const [action, setAction] = useState<PetAction>('idle');
  const [replay, setReplay] = useState(0);
  const [observation, setObservation] = useState('');
  const [supported, setSupported] = useState(true);
  const [reduced, setReduced] = useState(false);
  const activityKinds = ['thinking', 'responding', 'reading', 'writing', 'searching', 'executing', 'compacting'];
  const occurrences = ['tool_error', 'output_limited', 'cancelled'];
  const status = observation === 'cancelled' ? 'idle' : observation === 'output_limited' ? 'error' : 'working';
  const state = applyObservation(createSessionState(), { sessionId: 'isolated-review', provider: 'pi', observedAt: '2026-10-15T00:00:00Z', status,
    capabilities: Object.fromEntries([...activityKinds, ...occurrences, 'waiting_input', 'retrying'].map(id => [id, supported ? 'supported' : 'unknown'])),
    facts: { activities: activityKinds.includes(observation) ? [observation as ActivityKind] : [], waitingForInput: observation === 'waiting_input',
      ...(occurrences.includes(observation) ? { occurrence: { kind: observation as OccurrenceKind, id: `review-${replay}` } } : {}) } });
  const projected = projectPetPresentation(state);
  const selected = observation ? projected.action : action;
  const resolved = resolvePetAnimation(selected, cases[asset], Object.values(bundledAnimations).filter((clip): clip is string => typeof clip === 'string'));
  return <main style={{ fontFamily: 'system-ui', color: '#39314f', padding: 24 }}><h1>动作与静态回退</h1>
    <p>隔离检查 · 正式 R3F 播放器与内置 GLB。不连接 Agent。</p>
    <label>动画能力 <select value={asset} onChange={event => setAsset(event.target.value)}>{Object.keys(cases).map(name => <option key={name}>{name}</option>)}</select></label>{' '}
    <label><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} />减少动画</label>
    <p><label>观察事件 <select value={observation} onChange={event => { setObservation(event.target.value); setReplay(value => value + 1); }}><option value="">主动试播</option>
      {[...activityKinds, 'waiting_input', ...occurrences, 'retrying'].map(id => <option key={id} value={id}>{petActionCatalog[id as PetAction].label}</option>)}</select></label>{' '}
      <label><input type="checkbox" checked={supported} onChange={event => setSupported(event.target.checked)} />当前接入已确认支持</label></p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>{petActionIds.map(id => <button key={id} aria-pressed={id === action} onClick={() => { setObservation(''); setAction(id); setReplay(value => value + 1); }}>{petActionCatalog[id].label}</button>)}</div>
    <div style={{ height: 420, background: '#f3effa', borderRadius: 24, marginTop: 20 }}>
      <Canvas camera={{ position: [0, 1.1, 6], fov: 38 }}><ambientLight intensity={2} /><directionalLight position={[3, 4, 4]} intensity={2} />
        <Suspense fallback={null}><ScenePet action={selected} replay={observation ? projected.replay : replay} restAction={observation ? projected.restAction : 'idle'} reduced={reduced} animations={cases[asset] ?? {}} onReady={ready} /></Suspense>
      </Canvas>
    </div><p role="status">{asset} · {petActionCatalog[selected].label} · {resolved ? `实际动画：${resolved.clip}` : '静态姿势'}</p>
  </main>;
}
function ready() {}
createRoot(document.getElementById('app')!).render(<Review />);
