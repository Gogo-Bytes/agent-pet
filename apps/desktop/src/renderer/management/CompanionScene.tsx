import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Icon } from './components/icons.js';
import { GlassButton } from '../shared/ui/Glass.js';
import { HomeScene, PetPreviewScene, type HomePet } from './ManagementScenes.js';
export type { HomePet } from './ManagementScenes.js';
import { PreferenceRenderLoop } from '../shared/PreferenceRenderLoop.js';
import type { Preferences } from '../../shared/preferences.js';
import type { PetAnimations } from '@agent-pet/pet-runtime';
import './scene.css';

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Home and pet audition share one persistent Canvas and the same configuration projection. */
export function CompanionScene({ pets, page, preferences, action, replay, modelUrl, animations, modelUrls, assetAnimations, onClips, children }: {
  pets: HomePet[]; page: string; preferences: Preferences; action: string; replay: number; modelUrl?: string | undefined; animations?: Record<string, string | null> | undefined; modelUrls?: Record<string, string> | undefined; assetAnimations?: Record<string, PetAnimations> | undefined;
  onClips: (clips: string[]) => void; children: ReactNode;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const [documentVisible, setDocumentVisible] = useState(!document.hidden);
  const [systemReduced, setSystemReduced] = useState(false);
  const [failedAsset, setFailedAsset] = useState<string | null>(null);
  const assetKey = JSON.stringify([modelUrl ?? 'starter', modelUrls ?? {}]);
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
  return <section ref={surface} className="companion-scene" hidden={!visible} aria-label="宠物场景" data-focused={!!active} data-scene={editing ? 'pet' : 'home'}
    onKeyDown={event => { if (event.key === 'Escape' && active) { event.stopPropagation(); overview(true); } }}>
    <SceneBoundary key={assetKey} onError={() => setFailedAsset(assetKey)}>
      <Canvas camera={{ position: [0, 4.5, 10], fov: 38 }} dpr={preferences.resolution / 100}
        gl={{ alpha: true, antialias: true }} frameloop="never" onPointerMissed={() => overview()}>
        <PreferenceRenderLoop active={visible && (!preferences.pauseHidden || documentVisible)} fps={preferences.fps} />
        <ambientLight intensity={2} /><directionalLight intensity={3} position={[-3, 7, 5]} color="#fff5ed" />
        <directionalLight intensity={1} position={[4, 3, -4]} color="#d6ceff" />
        {editing ? <PetPreviewScene action={action} replay={replay} reduced={reduced} onReady={ready} modelUrl={modelUrl} animations={animations} />
          : <HomeScene pets={pets} focused={focused} reduced={reduced} onFocus={setFocused} onReady={ready} modelUrls={modelUrls} animations={assetAnimations} />}
      </Canvas>
    </SceneBoundary>
    {failedAsset === assetKey && <div className="scene-message" role="alert"><p>宠物加载失败，请切换其他宠物或重新加载。</p><button className="cfg-secondary" onClick={() => location.reload()}>重新加载</button></div>}
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
