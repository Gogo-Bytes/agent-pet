// Test-only host: real production player and GLB, no Agent or Electron bridge.
import { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { bundledAnimations, petActionCatalog, petActionIds, type PetAnimations, type PetAction } from '@agent-pet/pet-runtime';
import { ScenePet } from '../management/ScenePet.js';
const cases: Record<string, PetAnimations> = {
  '内置四种动画': bundledAnimations, '全部静态': {}, '只有工作，无待机': { working: 'Work' },
  '只有庆祝，无待机': { success: 'Success' }, '引用不存在的动画': { idle: 'Missing', error: 'Missing' },
};
function Review() {
  const [asset, setAsset] = useState('内置四种动画');
  const [action, setAction] = useState<PetAction>('idle');
  const [replay, setReplay] = useState(0);
  const [reduced, setReduced] = useState(false);
  return <main style={{ fontFamily: 'system-ui', color: '#39314f', padding: 24 }}><h1>动作与静态回退</h1>
    <p>隔离检查 · 正式 R3F 播放器与内置 GLB。不连接 Agent。</p>
    <label>动画能力 <select value={asset} onChange={event => setAsset(event.target.value)}>{Object.keys(cases).map(name => <option key={name}>{name}</option>)}</select></label>{' '}
    <label><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} />减少动画</label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>{petActionIds.map(id => <button key={id} aria-pressed={id === action} onClick={() => { setAction(id); setReplay(value => value + 1); }}>{petActionCatalog[id].label}</button>)}</div>
    <div style={{ height: 420, background: '#f3effa', borderRadius: 24, marginTop: 20 }}>
      <Canvas camera={{ position: [0, 1.1, 6], fov: 38 }}><ambientLight intensity={2} /><directionalLight position={[3, 4, 4]} intensity={2} />
        <Suspense fallback={null}><ScenePet action={action} replay={replay} reduced={reduced} animations={cases[asset] ?? {}} onReady={ready} /></Suspense>
      </Canvas>
    </div><p role="status">{asset} · {petActionCatalog[action].label}</p>
  </main>;
}
function ready() {}
createRoot(document.getElementById('app')!).render(<Review />);
