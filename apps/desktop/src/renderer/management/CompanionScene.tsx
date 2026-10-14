import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3 } from 'three';
import { Icon } from './components/icons.js';
import { GlassButton } from './components/glass.js';
import { ScenePet } from './ScenePet.js';
import { PreferenceRenderLoop } from '../shared/PreferenceRenderLoop.js';
import type { Preferences } from '../../shared/preferences.js';
import './scene.css';

export type HomePet = { id: string; agent: string; name: string; configuration: string; status: string; action: string };
export type Point = [number, number, number];
export function petPosition(index: number, count: number): Point {
  const columns = Math.min(count, 3) || 1;
  const row = Math.floor(index / columns);
  const rowCount = Math.min(columns, count - row * columns);
  return [(index % columns - (rowCount - 1) / 2) * 2.7, 0, (row - (Math.ceil(count / columns) - 1) / 2) * 2.6];
}
function CameraRig({ target, count, reduced, editing }: { target: Point | null; count: number; reduced: boolean; editing: boolean }) {
  const { camera, size } = useThree();
  const look = useRef(new Vector3(0, .8, 0));
  const goal = useRef(new Vector3());
  const destination = useRef(new Vector3());
  useFrame((_, delta) => {
    const narrow = size.width < 650;
    const rows = Math.max(1, Math.ceil(count / 3));
    const halfWidth = (Math.min(count, 3) - 1) * 2.7 / 2 + 1.1;
    const distance = Math.max(8, halfWidth / (Math.tan(19 * Math.PI / 180) * size.width / size.height)) + (rows - 1) * 2.2;
    destination.current.set(target ? target[0] : 0, target ? 2.4 : 4.5 + rows - 1,
      target ? target[2] + (narrow ? 6.6 : 5.1) : distance);
    goal.current.set(target ? target[0] - (narrow ? 0 : 1) : 0, target ? (narrow ? .55 : 1) : .8, target ? target[2] : 0);
    if (editing) { destination.current.set(0, 2.4, narrow ? 7 : 5.6); goal.current.set(narrow ? 0 : -1.4, .9, 0); }
    const rate = reduced ? 1 : 1 - Math.exp(-MathUtils.clamp(delta, 0, .1) * 5);
    camera.position.lerp(destination.current, rate); look.current.lerp(goal.current, rate); camera.lookAt(look.current);
  });
  return null;
}
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Home and pet audition share one persistent Canvas and the same configuration projection. */
export function CompanionScene({ pets, page, preferences, action, replay, onClips, children }: {
  pets: HomePet[]; page: string; preferences: Preferences; action: string; replay: number;
  onClips: (clips: string[]) => void; children: ReactNode;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const [documentVisible, setDocumentVisible] = useState(!document.hidden);
  const [systemReduced, setSystemReduced] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const surface = useRef<HTMLElement>(null);
  const active = pets.find(pet => pet.id === focused);
  const visible = page === 'home' || page === 'pets';
  const editing = page === 'pets';
  const reduced = preferences.reduced || systemReduced;
  const ready = useCallback((clips: string[]) => { setLoading(false); onClips(clips); }, [onClips]);
  useEffect(() => {
    const visibility = () => setDocumentVisible(!document.hidden);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches); update();
    document.addEventListener('visibilitychange', visibility); media.addEventListener('change', update);
    return () => { document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', update); };
  }, []);
  useEffect(() => { if (!visible || editing || !pets.some(pet => pet.id === focused)) setFocused(null); }, [visible, editing, focused, pets]);
  useEffect(() => {
    if (!visible || editing || !focused) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setFocused(null); surface.current?.querySelector<HTMLButtonElement>(`[data-focus-id="${focused}"]`)?.focus({ preventScroll: true }); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [visible, editing, focused]);
  function overview(restore = false) {
    if (restore && focused) surface.current?.querySelector<HTMLButtonElement>(`[data-focus-id="${focused}"]`)?.focus({ preventScroll: true });
    setFocused(null);
  }
  return <section ref={surface} className="companion-scene" hidden={!visible} aria-label="宠物场景" data-focused={!!active}
    onKeyDown={event => { if (event.key === 'Escape' && active) { event.stopPropagation(); overview(true); } }}>
    <SceneBoundary onError={() => setFailed(true)}>
      <Canvas camera={{ position: [0, 4.5, 10], fov: 38 }} dpr={preferences.resolution / 100}
        gl={{ alpha: true, antialias: true }} frameloop="never" onPointerMissed={() => overview()}>
        <PreferenceRenderLoop active={visible && (!preferences.pauseHidden || documentVisible)} fps={preferences.fps} />
        <ambientLight intensity={2} /><directionalLight intensity={3} position={[-3, 7, 5]} color="#fff5ed" />
        <directionalLight intensity={1} position={[4, 3, -4]} color="#d6ceff" />
        <CameraRig count={pets.length} target={active ? petPosition(pets.indexOf(active), pets.length) : null} reduced={reduced} editing={editing} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.07, 0]}>
          <circleGeometry args={[Math.max(5.4, Math.ceil(pets.length / 3) * 1.8), 80]} /><meshStandardMaterial color="#ede7fc" roughness={1} />
        </mesh>
        <Suspense fallback={null}>
          {editing ? <ScenePet action={action} replay={replay} reduced={reduced} onReady={ready} /> : pets.map((pet, index) =>
            <group key={pet.id} position={petPosition(index, pets.length)} onClick={event => { event.stopPropagation(); setFocused(pet.id); }}>
              <ScenePet action={pet.action} reduced={reduced} onReady={ready} />
            </group>)}
        </Suspense>
      </Canvas>
    </SceneBoundary>
    {failed && <div className="scene-message" role="alert"><p>内置宠物加载失败。</p><button className="cfg-secondary" onClick={() => location.reload()}>重新加载</button></div>}
    {editing ? children : <>
      {active && <><div className="pet-identity home-focus-info" role="status"><span className="identity-agent">{active.agent}</span><h1>{active.name}</h1><span className="identity-status">{active.status}</span><small>{active.configuration}</small></div>
        <GlassButton className="home-overview" onClick={() => overview(true)}><Icon name="left" />返回全景</GlassButton></>}
      {!!pets.length && <div className="scene-keyboard" aria-label="选择在线宠物">{pets.map(pet => <button key={pet.id} data-focus-id={pet.id} aria-pressed={focused === pet.id}
        aria-label={`聚焦 ${pet.agent} 的${pet.name}（${pet.configuration}）`} onClick={() => setFocused(pet.id)}>{pet.agent} · {pet.configuration}</button>)}</div>}
      {pets.length && !active ? <p className="home-scene-hint">{loading ? '正在加载内置宠物…' : '点击宠物，查看信息'}</p> : !pets.length ?
        <div className="home-scene-empty"><h1>还没有在线的 Agent</h1><p>Agent 启动并连接后，它的宠物会出现在这里。</p><p>可以从底部「连接」添加配置。</p></div> : null}
    </>}
  </section>;
}
