import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { parseBundledPet, type LoadedPet, type PetMotion } from '@agent-pet/pet-runtime/model';
import starterUrl from '@agent-pet/pet-runtime/assets/starter.glb?url';
import type { PetStore } from '../../app/bridge/pet-store.js';
import { selectPetMotion } from '../../pet-motion.js';

// Temporary R1 owner of the existing Three scene, loader and 30fps RAF.
// R2 replaces this owner, rather than running R3F alongside it.
export function createPetScene(canvas: HTMLCanvasElement, store: PetStore, onNotice: (message: string) => void) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, .4, 4.2);
  camera.lookAt(0, .2, 0);
  scene.add(new AmbientLight(new Color('#ffffff'), 2));
  const light = new DirectionalLight('#ffffff', 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  let pet: LoadedPet | undefined;
  let motion: PetMotion = selectPetMotion(store.getSnapshot().sessions.bubbles);
  let destroyed = false;
  const abort = new AbortController();
  const unsubscribe = store.subscribe(() => {
    motion = selectPetMotion(store.getSnapshot().sessions.bubbles);
    pet?.setMotion(motion);
  });
  onNotice('正在加载内置 GLB 宠物…');
  async function loadStarter(): Promise<void> {
    try {
      if (destroyed) return;
      const response = await fetch(starterUrl, { signal: abort.signal });
      if (!response.ok) throw new Error('Bundled model is unavailable');
      const bytes = await response.arrayBuffer();
      if (destroyed) return;
      const loaded = await parseBundledPet(bytes, {
        idle: 'Idle', working: 'Work', success: 'Success', error: 'Error',
      });
      if (destroyed) { loaded.dispose(); return; }
      pet = loaded;
      pet.root.scale.setScalar(1.1);
      scene.add(pet.root);
      pet.setMotion(motion);
      onNotice('');
    } catch {
      if (!destroyed) onNotice('内置宠物加载失败，请重新打开窗口。');
    }
  }
  // Avoid starting a second loader during StrictMode's setup/cleanup probe.
  void Promise.resolve().then(loadStarter);
  function resize(): void {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('resize', resize);
  let lastFrame = 0;
  let frame = 0;
  function render(now: number): void {
    if (destroyed) return;
    frame = requestAnimationFrame(render);
    if (document.hidden) { lastFrame = now; return; }
    if (now - lastFrame < 1000 / 30) return;
    pet?.update((now - lastFrame) / 1000);
    lastFrame = now;
    renderer.render(scene, camera);
  }
  resize();
  frame = requestAnimationFrame(render);
  return () => {
    if (destroyed) return;
    destroyed = true;
    abort.abort();
    unsubscribe();
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('resize', resize);
    pet?.dispose();
    renderer.dispose();
  };
}
