import { readFileSync } from 'node:fs';
import { Activity, StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { create, act, type ReactThreeTest } from '@react-three/test-renderer';
import { Bounds, useGLTF } from '@react-three/drei';
import { useThree, type RootState } from '@react-three/fiber';
import { Box3, Mesh, Raycaster, Vector2, Vector3, type Group, type AnimationClip } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PetModel } from './PetModel.js';
import { bundledAnimationBounds } from './bundled-animation-bounds.js';
import type { DragDirection } from '../../shared/use-window-gesture.js';
import type { PetMotion, PetAnimations } from '@agent-pet/pet-runtime';

// Real parsed asset, R3F reconciler, Drei Bounds/useAnimations, Three actions.
// Only network/cache access is substituted; this test does not claim WebGL.
vi.mock('@react-three/drei', async original => ({
  ...await original<typeof import('@react-three/drei')>(), useGLTF: vi.fn(),
}));
let asset: { scene: Group; animations: AnimationClip[] };
const mounted: ReactThreeTest.Renderer[] = [];
beforeAll(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const bytes = Uint8Array.from(readFileSync(new URL('../../../../../../packages/pet-runtime/assets/starter.glb', import.meta.url))).buffer;
  asset = await new GLTFLoader().parseAsync(bytes, '');
});
afterAll(() => vi.unstubAllGlobals());
afterEach(async () => { for (const view of mounted.splice(0)) await view.unmount(); vi.restoreAllMocks(); });

async function mount(motion: PetMotion = 'idle', size = 140, clips = asset.animations, reduced = false) {
  vi.mocked(useGLTF).mockReturnValue({ ...asset, animations: clips } as ReturnType<typeof useGLTF>);
  let state!: RootState;
  function Probe() { state = useThree(); return null; }
  let presentation: { connectionCue?: string; replay?: string; restAction?: PetMotion; animations?: PetAnimations; modelUrl?: string; dragDirection?: DragDirection | null; interactionActive?: boolean } = {};
  const ready = vi.fn();
  const hover = vi.fn();
  const tree = (value: PetMotion, visible = true) => <StrictMode><Activity mode={visible ? 'visible' : 'hidden'}><Probe /><Bounds margin={1.2} maxDuration={0}>
    <PetModel {...presentation} motion={value} reduced={reduced} onReady={ready} onHover={hover} />
  </Bounds></Activity></StrictMode>;
  const view = await create(tree(motion), { width: size, height: size, camera: { fov: 35, position: [0, 0, 5] } });
  mounted.push(view);
  const root = state.scene.getObjectByName('Pet')!;
  return { view, root, state, ready, hover, present: (value: typeof presentation) => { presentation = value; return view.update(tree(motion)); }, switchMotion: (value: PetMotion) => { motion = value; return view.update(tree(value)); }, show: (visible: boolean) => view.update(tree(motion, visible)), reduce: (value: boolean) => { reduced = value; return view.update(tree(motion)); } };
}

describe('PetModel bundled animation behavior', () => {
  it('plays a configuration connection once, keeps its identity through remount, and accepts only a fresh reconnect', async () => {
    const f = await mount();
    const animations = { connected: 'Success', idle: 'Idle' };
    await f.present({ animations, connectionCue: 'connected:desktop:first' });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.225, 4);
    await f.present({ animations, connectionCue: 'connected:desktop:first' });
    await f.view.advanceFrames(1, .1); expect(f.root.position.y).toBeCloseTo(.3, 4);
    await f.view.advanceFrames(10, .1); await f.view.advanceFrames(3, .1);
    expect(f.root.position.y).toBeCloseTo(.01, 4);
    await f.view.unmount(); mounted.splice(mounted.indexOf(f.view), 1);
    const again = await mount();
    await again.present({ animations, connectionCue: 'connected:desktop:first' });
    await again.view.advanceFrames(3, .1); expect(again.root.position.y).toBeCloseTo(.01, 4);
    await again.present({ animations, connectionCue: 'connected:desktop:reconnect' });
    await again.view.advanceFrames(3, .1); expect(again.root.position.y).toBeCloseTo(.225, 4);
  });

  it('does not interrupt current business or local feedback and never queues a covered connection for later idle', async () => {
    const f = await mount('working');
    const animations = { connected: 'Success', working: 'Work', success: 'Success', hover: 'Work', idle: 'Idle' };
    await f.present({ animations }); await f.view.advanceFrames(2, .1);
    await f.present({ animations, connectionCue: 'connected:busy:work' });
    await f.view.advanceFrames(1, .1); expect(f.root.position.x).toBeCloseTo(.06, 4);
    await f.switchMotion('idle'); await f.view.advanceFrames(3, .1);
    expect(f.root.position.y).toBeCloseTo(.01, 4);
    await f.switchMotion('success');
    await f.present({ animations, replay: 'connected:business-result' });
    await f.view.advanceFrames(2, .1);
    await f.present({ animations, replay: 'connected:business-result', connectionCue: 'connected:busy:result' });
    await f.view.advanceFrames(1, .1); expect(f.root.position.y).toBeCloseTo(.225, 4);
    await f.view.advanceFrames(10, .1); await f.view.advanceFrames(3, .1);
    expect(f.root.position.y).toBeCloseTo(.01, 4);
    await f.present({ animations, replay: 'connected:business-result', connectionCue: 'connected:busy:consumed-result' });
    await f.view.advanceFrames(1, .1); expect(f.root.position.y).toBeLessThan(.05);
    await f.switchMotion('idle');
    const target = f.view.scene.findByProps({ name: 'pet-pointer-target' });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(2, .1);
    await f.present({ animations, connectionCue: 'connected:busy:hover' });
    await f.view.advanceFrames(1, .1); expect(f.root.position.x).toBeCloseTo(.06, 4);
    await f.view.fireEvent(target, 'pointerOut', { intersections: [] });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.01, 4);
  });

  it('replaces a connection with the latest business cue without consuming that cue early', async () => {
    const f = await mount();
    const animations = { connected: 'Work', success: 'Success', idle: 'Idle' };
    await f.present({ animations, connectionCue: 'connected:latest' });
    await f.view.advanceFrames(3, .1); expect(f.root.position.x).toBeCloseTo(.06, 4);
    await f.present({ animations, connectionCue: 'connected:latest', replay: 'connection-next-business' });
    await f.switchMotion('success'); await f.view.advanceFrames(3, .1);
    expect(f.root.position.y).toBeCloseTo(.225, 4);
    await f.switchMotion('idle'); await f.view.advanceFrames(3, .1);
    expect(f.root.position.y).toBeCloseTo(.01, 4);
  });

  it('consumes reduced and missing connection feedback without delayed playback, including a static asset', async () => {
    const f = await mount('idle', 140, asset.animations, true);
    const animations = { connected: 'Success', idle: 'Idle' };
    await f.present({ animations, connectionCue: 'connected:reduced' });
    await f.view.advanceFrames(4, .1); expect(f.root.position.y).toBe(0);
    await f.reduce(false); await f.view.advanceFrames(3, .1);
    expect(f.root.position.y).toBeCloseTo(.01, 4);
    await f.present({ animations: { connected: 'missing', idle: 'Idle' }, connectionCue: 'connected:missing' });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.01, 4);
    await f.present({ animations, connectionCue: 'connected:missing' });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.01, 4);
    const still = await mount('idle', 140, []);
    await still.present({ animations, connectionCue: 'connected:no-clips' });
    await still.view.advanceFrames(3, .1); expect(still.root.position.toArray()).toEqual([0, 0, 0]);
  });

  it('plays hover only on model entry, once per edge, then resumes work without requiring pointer exit', async () => {
    const f = await mount('working');
    const animations = { hover: 'Success', working: 'Work' };
    await f.present({ animations, restAction: 'working' });
    const target = f.view.scene.findByProps({ name: 'pet-pointer-target' });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(2, .1);
    expect(f.root.position.y).toBeCloseTo(.15, 4);
    // R3F emits out/over when crossing child meshes of the same model.
    await f.view.fireEvent(target, 'pointerOut', { eventObject: target.instance, intersections: [{ eventObject: target.instance }] });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.present({ animations, restAction: 'working' });
    await f.view.advanceFrames(1, .1);
    expect(f.root.position.y).toBeCloseTo(.225, 4);
    await act(async () => { await f.view.advanceFrames(10, .1); }); await f.view.advanceFrames(3, .1);
    expect(f.root.position.x).toBeCloseTo(.06, 4);
    await f.view.fireEvent(target, 'pointerOut', { intersections: [] });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(2, .1);
    expect(f.root.position.y).toBeCloseTo(.15, 4);
    await f.view.fireEvent(target, 'pointerOut', { intersections: [] });
    await f.view.advanceFrames(3, .1);
    expect(f.root.position.x).toBeCloseTo(.06, 4);
  });
  it('keeps business cues pending during hover, resumes only the latest, and never replays a consumed result', async () => {
    const f = await mount('working');
    const animations = { hover: 'Work', success: 'Success', tool_error: 'Success', working: 'Work', idle: 'Idle' };
    await f.present({ animations, restAction: 'working' });
    const target = f.view.scene.findByProps({ name: 'pet-pointer-target' });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(3, .1);
    await f.switchMotion('success');
    await f.present({ animations, replay: 'hover-old-result', restAction: 'idle' });
    await f.switchMotion('tool_error');
    await f.present({ animations, replay: 'hover-latest-result', restAction: 'working' });
    await f.view.advanceFrames(1, .1);
    expect(f.root.position.x).not.toBe(0); // Still local Work, not business Success.
    await act(async () => { await f.view.advanceFrames(15, .1); });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.225, 4);
    await f.view.fireEvent(target, 'pointerOut', { intersections: [] });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(3, .1);
    await f.view.fireEvent(target, 'pointerOut', { intersections: [] });
    await f.view.advanceFrames(3, .1); expect(f.root.position.x).toBeCloseTo(.06, 4);
  });

  it('ignores absent hover mappings without resetting work and skips local feedback when reduced or hidden', async () => {
    const f = await mount('working');
    const animations = { working: 'Work', hover: 'missing', idle: 'Idle' };
    await f.present({ animations }); await f.view.advanceFrames(2, .1);
    const target = f.view.scene.findByProps({ name: 'pet-pointer-target' });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(1, .1); expect(f.root.position.x).toBeCloseTo(.06, 4);
    await f.view.fireEvent(target, 'pointerOut', { intersections: [] });
    const mapped = { ...animations, hover: 'Success' };
    await f.present({ animations: mapped });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(2, .1); expect(f.root.position.y).toBeCloseTo(.15, 4);
    await f.present({ animations: mapped, interactionActive: false });
    await f.view.advanceFrames(3, .1); expect(f.root.position.x).toBeCloseTo(.06, 4);
    await f.present({ animations: mapped }); await f.reduce(true);
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).not.toBeCloseTo(.225, 4);
    await f.reduce(false); await f.view.advanceFrames(3, .1);
    expect(f.root.position.x).toBeCloseTo(.06, 4);
    const still = await mount('working', 140, []);
    await still.present({ animations: mapped });
    await still.view.fireEvent(still.view.scene.findByProps({ name: 'pet-pointer-target' }), 'pointerOver', { stopPropagation() {} });
    await still.view.advanceFrames(3, .1); expect(still.root.position.toArray()).toEqual([0, 0, 0]);
  });

  it('cancels hover on drag entry, ignores new hover while dragging, and resumes the latest business cue on release', async () => {
    const f = await mount('working');
    const animations = { working: 'Work', dragging: 'Work', hover: 'Success', success: 'Success' };
    await f.present({ animations });
    const target = f.view.scene.findByProps({ name: 'pet-pointer-target' });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.view.advanceFrames(2, .1); expect(f.root.position.y).toBeCloseTo(.15, 4);
    await f.present({ animations, dragDirection: 'right' });
    await f.view.fireEvent(target, 'pointerOut', { intersections: [] });
    await f.view.fireEvent(target, 'pointerOver', { stopPropagation() {} });
    await f.switchMotion('success');
    await f.present({ animations, dragDirection: 'left', replay: 'hover-drag-result' });
    await f.view.advanceFrames(3, .1); expect(f.root.position.x).toBeCloseTo(.06, 4);
    await f.present({ animations, replay: 'hover-drag-result' });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.225, 4);
  });

  it('plays one dragging clip continuously through direction changes, rotates only the outer group and restores work', async () => {
    const { view, root, state, present } = await mount('working');
    const animations = { dragging: 'Success', working: 'Work' };
    await present({ animations, dragDirection: 'right' });
    await view.advanceFrames(2, .1);
    const target = state.scene.getObjectByName('pet-pointer-target')!;
    expect(target.rotation.y).toBeCloseTo(Math.PI / 18);
    expect(root.rotation.y).toBe(0);
    expect(root.position.y).toBeCloseTo(.15, 4);
    for (const [direction, x, y] of [['left', 0, -Math.PI / 18], ['up', -Math.PI / 18, 0], ['down', Math.PI / 18, 0]] as const) {
      await present({ animations, dragDirection: direction });
      expect(target.rotation.x).toBeCloseTo(x); expect(target.rotation.y).toBeCloseTo(y);
    }
    await view.advanceFrames(1, .1);
    expect(root.position.y).toBeCloseTo(.225, 4); // Direction changes did not restart the clip.
    await present({ animations, dragDirection: null }); await view.advanceFrames(3, .1);
    expect(target.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(root.position.x).toBeCloseTo(.06, 4); expect(root.position.y).toBeCloseTo(.08, 4);
  });

  it('returns to the latest business state and does not replay a cue already played before dragging', async () => {
    const f = await mount('success');
    const animations = { dragging: 'Work', success: 'Success', idle: 'Idle' };
    await f.present({ animations, modelUrl: 'blob:imported', replay: 'drag-already-played' });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.225, 4);
    await f.present({ animations, modelUrl: 'blob:imported', replay: 'drag-already-played', dragDirection: 'up' });
    await f.view.advanceFrames(3, .1);
    await f.present({ animations, modelUrl: 'blob:imported', replay: 'drag-already-played', dragDirection: null });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.01, 4);
    await f.present({ animations, dragDirection: 'down' });
    await f.switchMotion('idle');
    await f.present({ animations, dragDirection: null });
    await f.view.advanceFrames(3, .1); expect(f.root.position.y).toBeCloseTo(.01, 4);
  });

  it('does not consume or restart business cues received during drag, then plays the latest result on release', async () => {
    const { view, root, present, switchMotion } = await mount('working');
    const animations = { dragging: 'Work', success: 'Success', error: 'Error' };
    await present({ animations, dragDirection: 'right', replay: 'drag-result-first' });
    await switchMotion('success'); await view.advanceFrames(2, .1);
    await present({ animations, dragDirection: 'left', replay: 'drag-result-latest' });
    await view.advanceFrames(1, .1);
    expect(root.position.x).toBeCloseTo(.06, 4); // Work still at 0.3s, not restarted by replay.
    await present({ animations, dragDirection: null, replay: 'drag-result-latest' });
    await view.advanceFrames(3, .1);
    expect(root.position.y).toBeCloseTo(.225, 4);
  });

  it('keeps tilt neutral and pauses the dragging clip with reduced motion, including unmapped/static assets', async () => {
    const f = await mount('working', 140, asset.animations, true);
    const animations = { dragging: 'Work' };
    await f.present({ animations, dragDirection: 'up' }); await f.view.advanceFrames(1, .1);
    const position = f.root.position.clone();
    await f.view.advanceFrames(5, .1);
    expect(f.root.position.equals(position)).toBe(true);
    expect(f.state.scene.getObjectByName('pet-pointer-target')!.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    const staticPet = await mount('success', 140, []);
    await staticPet.present({ animations: {}, dragDirection: 'left', replay: 'unmapped-drag' });
    await staticPet.view.advanceFrames(3, .1);
    expect(staticPet.root.position.toArray()).toEqual([0, 0, 0]);
    expect(staticPet.state.scene.getObjectByName('pet-pointer-target')!.rotation.y).toBeCloseTo(-Math.PI / 18);
  });
  it('raycasts the real GLB instead of its transparent canvas corners and clears hover on teardown', async () => {
    const { view, state, hover } = await mount();
    await view.advanceFrames(2, .016);
    state.scene.updateMatrixWorld(true); state.camera.updateMatrixWorld();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(0, 0), state.camera);
    expect(ray.intersectObjects(state.scene.children, true).length).toBeGreaterThan(0);
    ray.setFromCamera(new Vector2(.99, .99), state.camera);
    expect(ray.intersectObjects(state.scene.children, true)).toHaveLength(0);
    const target = view.scene.findByProps({ name: 'pet-pointer-target' });
    await view.fireEvent(target, 'pointerOver', { stopPropagation: vi.fn() });
    expect(hover).toHaveBeenLastCalledWith(true);
    await view.fireEvent(target, 'pointerOut', { intersections: [] });
    expect(hover).toHaveBeenLastCalledWith(false);
    await view.unmount(); mounted.splice(mounted.indexOf(view), 1);
    expect(hover).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['idle', 0, .01], ['working', .06, .08], ['success', 0, .225], ['error', 0, 0],
  ] as const)('plays %s using the actual GLB clip', async (motion, x, y) => {
    const { view, root } = await mount(motion);
    await view.advanceFrames(3, .1);
    expect(root.position.x).toBeCloseTo(x, 4);
    expect(root.position.y).toBeCloseTo(y, 4);
    expect(vi.mocked(useGLTF)).toHaveBeenCalledWith(expect.stringContaining('starter.glb'), false, false);
  });

  it('pauses continuous GLB movement when reduced animation is selected, then resumes from the chosen state', async () => {
    const { view, root, reduce, switchMotion } = await mount('working', 140, asset.animations, true);
    await view.advanceFrames(1, .1); // Evaluate the selected clip at its static initial pose.
    const position = root.position.clone();
    await view.advanceFrames(8, .1);
    expect(root.position.equals(position)).toBe(true);
    await switchMotion('error');
    await view.advanceFrames(1, .1);
    const errorPosition = root.position.clone();
    await view.advanceFrames(8, .1);
    expect(root.position.equals(errorPosition)).toBe(true);
    await reduce(false);
    await view.advanceFrames(3, .1);
    expect(root.position.equals(position)).toBe(false);
  });
  it('stops prior actions on quick switches and releases the pose/frame subscription on unmount without disposing cache assets', async () => {
    const cachedPet = asset.scene.getObjectByName('Pet')!;
    const cachedHead = asset.scene.getObjectByName('Head') as Mesh;
    const geometryDispose = vi.spyOn(cachedHead.geometry, 'dispose');
    const material = Array.isArray(cachedHead.material) ? cachedHead.material[0]! : cachedHead.material;
    const materialDispose = vi.spyOn(material, 'dispose');
    const { view, root, state, switchMotion } = await mount();
    expect(root).not.toBe(cachedPet);
    expect((root.getObjectByName('Head') as Mesh).geometry).toBe(cachedHead.geometry);
    for (const motion of ['working', 'success', 'error', 'idle'] as const) {
      await switchMotion(motion);
      await view.advanceFrames(1, .02);
    }
    await view.advanceFrames(3, .1);
    expect(root.position.x).toBe(0);
    expect(root.position.y).toBeCloseTo(.04 * .32 / 1.2, 4);
    expect(cachedPet.position.toArray()).toEqual([0, 0, 0]);
    await view.unmount();
    mounted.splice(mounted.indexOf(view), 1);
    expect(state.internal.subscribers).toHaveLength(0);
    expect(root.position.toArray()).toEqual([0, 0, 0]);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    const remount = await mount('success');
    await remount.view.advanceFrames(4, .1);
    expect(remount.root.position.y).toBeCloseTo(.3, 4);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('survives effect cleanup/setup on the same instance without stale cached action bindings', async () => {
    const { view, root, show } = await mount('success');
    await view.advanceFrames(2, .1);
    expect(root.position.y).toBeGreaterThan(0);
    await show(false);
    await show(true);
    await view.advanceFrames(4, .1);
    expect(root.position.y).toBeCloseTo(.3, 4);
  });

  it('renders a static asset with no Idle or animations', async () => {
    const { view, root, ready, switchMotion } = await mount('working', 140, []);
    expect(ready).toHaveBeenCalledWith('');
    for (const motion of ['working', 'success', 'error', 'idle'] as const) {
      await switchMotion(motion); await view.advanceFrames(5, .1);
      expect(root.position.toArray()).toEqual([0, 0, 0]);
    }
  });

  it('stops a working animation and restores the default pose when fallback is absent', async () => {
    const { view, root, switchMotion } = await mount('working', 140, asset.animations.filter(clip => clip.name === 'Work'));
    await view.advanceFrames(3, .1); expect(root.position.y).toBeGreaterThan(0);
    await switchMotion('error'); await view.advanceFrames(4, .1);
    expect(root.position.toArray()).toEqual([0, 0, 0]);
  });

  it('plays celebration once and returns to the available idle pose', async () => {
    const { view, root } = await mount('success');
    await view.advanceFrames(12, .1);
    await view.advanceFrames(3, .1);
    expect(root.position.x).toBe(0);
    expect(root.position.y).toBeLessThan(.05);
  });

  it('restores a static pose after the once-only clip ends when no Idle exists', async () => {
    const { view, root } = await mount('success', 140, asset.animations.filter(clip => clip.name === 'Success'));
    await view.advanceFrames(12, .1);
    expect(root.position.toArray()).toEqual([0, 0, 0]);
    await view.advanceFrames(12, .1);
    expect(root.position.toArray()).toEqual([0, 0, 0]);
  });

  it('continues current work when a transient animation is missing', async () => {
    const { view, root, present } = await mount('tool_error');
    await present({ restAction: 'working', replay: 'missing-tool-1' });
    await view.advanceFrames(3, .1);
    expect(root.position.x).toBeCloseTo(.06, 4);
    expect(root.position.y).toBeCloseTo(.08, 4);
  });

  it('plays a transient once, does not replay it when the resume action changes, then resumes the latest activity', async () => {
    const { view, root, present } = await mount('tool_error');
    const animations = { tool_error: 'Success', working: 'Work', reading: 'Work' };
    await present({ animations, restAction: 'working', replay: 'tool-1' });
    await view.advanceFrames(3, .1); expect(root.position.y).toBeCloseTo(.225, 4);
    await present({ animations, restAction: 'reading', replay: 'tool-1' });
    await view.advanceFrames(1, .1); expect(root.position.y).toBeCloseTo(.3, 4);
    await view.advanceFrames(8, .1); await view.advanceFrames(3, .1);
    expect(root.position.x).toBeCloseTo(.06, 4); expect(root.position.y).toBeCloseTo(.08, 4);
  });

  it('does not replay an already observed business result after waiting or remount, but plays a new work result', async () => {
    const { view, root, present, switchMotion } = await mount('success');
    await present({ replay: 'business-success-one' });
    await view.advanceFrames(3, .1); expect(root.position.y).toBeCloseTo(.225, 4);
    await switchMotion('waiting_input'); await view.advanceFrames(2, .1);
    await switchMotion('success'); await view.advanceFrames(3, .1);
    expect(root.position.y).toBeLessThan(.05);
    await view.unmount(); mounted.splice(mounted.indexOf(view), 1);
    const other = await mount('success');
    await other.present({ replay: 'business-success-one' });
    await other.view.advanceFrames(3, .1); expect(other.root.position.y).toBeLessThan(.05);
    await other.present({ replay: 'business-success-two' });
    await other.view.advanceFrames(3, .1); expect(other.root.position.y).toBeCloseTo(.225, 4);
  });

  it('refits after an authoritative size change without replacing the animated instance', async () => {
    const { view, state, root } = await mount('success', 140);
    await view.advanceFrames(3, .1);
    for (const size of [80, 300, 600, 140]) {
      await act(async () => { state.setSize(size, size); });
      await view.advanceFrames(2, .01);
      expect(state.scene.getObjectByName('Pet')).toBe(root);
      const pose = new Box3().setFromObject(root);
      for (const corner of [pose.min, pose.max]) {
        const projected = corner.clone().project(state.camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
      }
    }
  });

  it('falls back to Idle for missing optional clips', async () => {
    const { view, root, switchMotion } = await mount('working', 140, asset.animations.filter(clip => clip.name === 'Idle'));
    for (const motion of ['working', 'success', 'error'] as const) {
      await switchMotion(motion);
      await view.advanceFrames(3, .1);
      expect(root.position.x).toBe(0);
      expect(root.position.y).toBeCloseTo(.01, 4);
    }
  });

  it.each([80, 140, 300, 600])('Bounds keeps the full animated envelope inside the %spx camera', async size => {
    const { view, state, root } = await mount('success', size);
    await view.advanceFrames(2, .01);
    const envelope = bundledAnimationBounds(asset.scene, asset.animations);
    expect(envelope.max.y).toBeCloseTo(1.62, 4);
    for (const x of [envelope.min.x, envelope.max.x]) {
      for (const y of [envelope.min.y, envelope.max.y]) {
        for (const z of [envelope.min.z, envelope.max.z]) {
          const point = new Vector3(x, y, z).project(state.camera);
          expect(Math.abs(point.x)).toBeLessThan(1);
          expect(Math.abs(point.y)).toBeLessThan(1);
          expect(Math.abs(point.z)).toBeLessThan(1);
        }
      }
    }
    for (let frame = 0; frame < 80; frame++) {
      await view.advanceFrames(1, .01);
      const pose = new Box3().setFromObject(root);
      expect(envelope.containsBox(pose)).toBe(true);
    }
  });

  it('uses R3F clock reset when pausing/resuming, without a hidden-time animation jump', async () => {
    const { view, state, root } = await mount('idle');
    await view.advanceFrames(1, .1);
    const before = root.position.y;
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    await act(async () => { state.setFrameloop('never'); });
    expect(state.get().frameloop).toBe('never');
    expect(state.clock.running).toBe(false);
    now.mockReturnValue(61_000);
    await act(async () => { state.setFrameloop('always'); });
    expect(state.clock.running).toBe(true);
    now.mockReturnValue(61_016);
    const delta = state.clock.getDelta();
    expect(delta).toBeCloseTo(.016);
    await view.advanceFrames(1, delta);
    expect(root.position.y - before).toBeCloseTo(.04 * .016 / 1.2, 4);
  });
});
