import { readFileSync } from 'node:fs';
import { Activity, Component, StrictMode, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { create, act, type ReactThreeTest } from '@react-three/test-renderer';
import { Bounds, useGLTF } from '@react-three/drei';
import { useThree, type RootState } from '@react-three/fiber';
import { Box3, Mesh, Vector3, type Group, type AnimationClip } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PetModel } from './PetModel.js';
import { bundledAnimationBounds } from './bundled-animation-bounds.js';
import type { PetMotion } from '@agent-pet/pet-runtime';

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

async function mount(motion: PetMotion = 'idle', size = 140, clips = asset.animations) {
  vi.mocked(useGLTF).mockReturnValue({ ...asset, animations: clips } as ReturnType<typeof useGLTF>);
  let state!: RootState;
  function Probe() { state = useThree(); return null; }
  const ready = vi.fn();
  const tree = (value: PetMotion, visible = true) => <StrictMode><Activity mode={visible ? 'visible' : 'hidden'}><Probe /><Bounds margin={1.2} maxDuration={0}>
    <PetModel motion={value} onReady={ready} />
  </Bounds></Activity></StrictMode>;
  const view = await create(tree(motion), { width: size, height: size, camera: { fov: 35, position: [0, 0, 5] } });
  mounted.push(view);
  const root = state.scene.getObjectByName('Pet')!;
  return { view, root, state, ready, switchMotion: (value: PetMotion) => view.update(tree(value)), show: (visible: boolean) => view.update(tree(motion, visible)) };
}

describe('PetModel bundled animation behavior', () => {
  it.each([
    ['idle', 0, .01], ['working', .06, .08], ['success', 0, .225], ['error', .05, 0],
  ] as const)('plays %s using the actual GLB clip', async (motion, x, y) => {
    const { view, root } = await mount(motion);
    await view.advanceFrames(3, .1);
    expect(root.position.x).toBeCloseTo(x, 4);
    expect(root.position.y).toBeCloseTo(y, 4);
    expect(vi.mocked(useGLTF)).toHaveBeenCalledWith(expect.stringContaining('starter.glb'), false, false);
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

  it('rejects a missing required Idle clip at the model boundary', async () => {
    const caught = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch(error: Error) { caught(error.message); }
      render() { return this.state.failed ? null : this.props.children; }
    }
    vi.mocked(useGLTF).mockReturnValue({ ...asset, animations: [] } as ReturnType<typeof useGLTF>);
    const view = await create(<Boundary><PetModel motion="idle" onReady={vi.fn()} /></Boundary>);
    mounted.push(view);
    expect(caught).toHaveBeenCalledWith('Required Idle clip is missing');
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
