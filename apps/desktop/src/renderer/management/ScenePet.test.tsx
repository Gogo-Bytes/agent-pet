import { readFileSync } from 'node:fs';
import { Component, StrictMode, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { create, type ReactThreeTest } from '@react-three/test-renderer';
import { useGLTF } from '@react-three/drei';
import { useThree, type RootState } from '@react-three/fiber';
import { Box3, Mesh, type AnimationClip, type Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ScenePet } from './ScenePet.js';

// Real bundled GLB, Three mixer/actions and R3F reconciler. Replace only asset URL loading.
vi.mock('@react-three/drei', async original => ({ ...await original<typeof import('@react-three/drei')>(), useGLTF: vi.fn() }));
let asset: { scene: Group; animations: AnimationClip[] };
const mounted: ReactThreeTest.Renderer[] = [];
beforeAll(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const bytes = Uint8Array.from(readFileSync(new URL('../../../../../packages/pet-runtime/assets/starter.glb', import.meta.url))).buffer;
  asset = await new GLTFLoader().parseAsync(bytes, '');
});
afterAll(() => vi.unstubAllGlobals());
afterEach(async () => { for (const view of mounted.splice(0)) await view.unmount(); vi.restoreAllMocks(); });
type Instance = { id: string; action: string; replay?: number; reduced?: boolean };
async function mount(instances: Instance[], clips = asset.animations) {
  vi.mocked(useGLTF).mockReturnValue({ ...asset, animations: clips } as ReturnType<typeof useGLTF>);
  let state!: RootState;
  function Probe() { state = useThree(); return null; }
  const ready = vi.fn();
  const tree = (values: Instance[]) => <StrictMode><Probe />{values.map((value, index) => <group key={value.id} name={value.id} position={[index * 3, 0, 0]}>
    <ScenePet action={value.action} replay={value.replay ?? 0} reduced={value.reduced ?? false} onReady={ready} />
  </group>)}</StrictMode>;
  const view = await create(tree(instances)); mounted.push(view);
  return { view, state, ready, root: (id: string) => state.scene.getObjectByName(id)!.getObjectByName('Pet')!, update: (values: Instance[]) => view.update(tree(values)) };
}

describe('ScenePet actual bundled asset and multi-instance lifecycle', () => {
  it('creates independent instances and one mixer per pet while preserving the shared cached asset', async () => {
    const test = await mount([{ id: 'a', action: 'Work' }, { id: 'b', action: 'Success' }]);
    const a = test.root('a'); const b = test.root('b');
    expect(a).not.toBe(b); expect(a).not.toBe(asset.scene.getObjectByName('Pet'));
    expect(test.state.internal.subscribers).toHaveLength(2);
    await test.view.advanceFrames(3, .1);
    expect(a.position.x).toBeCloseTo(.06, 4); expect(a.position.y).toBeCloseTo(.08, 4);
    expect(b.position.x).toBe(0); expect(b.position.y).toBeCloseTo(.225, 4);
    expect(asset.scene.getObjectByName('Pet')!.position.toArray()).toEqual([0, 0, 0]);
    expect((a.getObjectByName('Head') as Mesh).geometry).toBe((b.getObjectByName('Head') as Mesh).geometry);
    await test.update([{ id: 'a', action: 'Error' }, { id: 'b', action: 'Success' }]);
    expect(test.root('a')).toBe(a); expect(test.root('b')).toBe(b);
    await test.view.advanceFrames(1, .1);
    expect(a.position.x).toBeCloseTo(.05, 4);
    expect(b.position.y).toBeCloseTo(.3, 4);
    expect(test.state.internal.subscribers).toHaveLength(2);
  });
  it('replays the same action from its start without replacing the model or creating another frame subscriber', async () => {
    const test = await mount([{ id: 'a', action: 'Success' }]); const root = test.root('a');
    await test.view.advanceFrames(4, .1); expect(root.position.y).toBeCloseTo(.3, 4);
    await test.update([{ id: 'a', action: 'Success', replay: 1 }]);
    await test.view.advanceFrames(1, .1);
    expect(root.position.y).toBeCloseTo(.075, 4);
    expect(test.root('a')).toBe(root); expect(test.state.internal.subscribers).toHaveLength(1);
    for (const action of ['Error', 'Work', 'Idle', 'Work']) await test.update([{ id: 'a', action }]);
    await test.view.advanceFrames(3, .1);
    expect(root.position.x).toBeCloseTo(.06, 4); expect(root.position.y).toBeCloseTo(.08, 4);
    expect(test.state.internal.subscribers).toHaveLength(1);
  });
  it('exposes only available clip capabilities and uses actual Idle when an optional action is absent', async () => {
    const test = await mount([{ id: 'a', action: 'Work' }], asset.animations.filter(clip => clip.name === 'Idle'));
    expect(test.ready).toHaveBeenCalledWith(['Idle']);
    await test.view.advanceFrames(3, .1);
    expect(test.root('a').position.x).toBe(0); expect(test.root('a').position.y).toBeCloseTo(.01, 4);
    expect(vi.mocked(useGLTF)).toHaveBeenCalledWith(expect.stringContaining('starter.glb'), false, false);
  });
  it('reduces continuous movement independently for one pet while retaining status and replay changes', async () => {
    const test = await mount([{ id: 'a', action: 'Work', reduced: true }, { id: 'b', action: 'Success' }]);
    await test.view.advanceFrames(1, .1);
    const still = test.root('a').position.clone(); const moving = test.root('b').position.clone();
    await test.view.advanceFrames(3, .1);
    expect(test.root('a').position.equals(still)).toBe(true);
    expect(test.root('b').position.equals(moving)).toBe(false);
    await test.update([{ id: 'a', action: 'Error', reduced: true, replay: 1 }, { id: 'b', action: 'Success' }]);
    await test.view.advanceFrames(1, .1); const errorPose = test.root('a').position.clone();
    await test.view.advanceFrames(6, .1); expect(test.root('a').position.equals(errorPose)).toBe(true);
    await test.update([{ id: 'a', action: 'Work', reduced: false }, { id: 'b', action: 'Success' }]);
    await test.view.advanceFrames(3, .1); expect(test.root('a').position.equals(errorPose)).toBe(false);
  });
  it('removes only departing-instance subscriptions and releases all mixers without disposing shared geometry or materials', async () => {
    const head = asset.scene.getObjectByName('Head') as Mesh;
    const geometryDispose = vi.spyOn(head.geometry, 'dispose');
    const material = Array.isArray(head.material) ? head.material[0]! : head.material;
    const materialDispose = vi.spyOn(material, 'dispose');
    const test = await mount([{ id: 'a', action: 'Work' }, { id: 'b', action: 'Success' }]); const b = test.root('b');
    await test.view.advanceFrames(2, .1);
    await test.update([{ id: 'b', action: 'Success' }]);
    expect(test.state.internal.subscribers).toHaveLength(1); expect(test.root('b')).toBe(b);
    await test.view.advanceFrames(1, .1); expect(b.position.y).toBeCloseTo(.225, 4);
    expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
    await test.view.unmount(); mounted.splice(mounted.indexOf(test.view), 1);
    expect(test.state.internal.subscribers).toHaveLength(0);
    expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
    const again = await mount([{ id: 'c', action: 'Work' }]);
    await again.view.advanceFrames(3, .1); expect(again.root('c').position.x).toBeCloseTo(.06, 4);
  });
  it('fits each actual animated model into a finite normalized envelope with its feet on the scene floor', async () => {
    const test = await mount([{ id: 'a', action: 'Success' }]);
    for (let frame = 0; frame < 12; frame++) {
      await test.view.advanceFrames(1, .1);
      const bounds = new Box3().setFromObject(test.state.scene.getObjectByName('a')!);
      expect(bounds.min.y).toBeGreaterThanOrEqual(-.0001);
      expect(bounds.max.y).toBeLessThanOrEqual(2.1001);
      expect(Number.isFinite(bounds.min.x) && Number.isFinite(bounds.max.x)).toBe(true);
    }
  });
  it('rejects missing Idle capability without publishing a usable action list', async () => {
    const caught = vi.fn(); const ready = vi.fn(); vi.spyOn(console, 'error').mockImplementation(() => {});
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch(error: Error) { caught(error.message); }
      render() { return this.state.failed ? null : this.props.children; }
    }
    vi.mocked(useGLTF).mockReturnValue({ ...asset, animations: [] } as ReturnType<typeof useGLTF>);
    const view = await create(<Boundary><ScenePet action="Idle" reduced={false} onReady={ready} /></Boundary>); mounted.push(view);
    expect(caught).toHaveBeenCalledWith('Required Idle clip missing'); expect(ready).not.toHaveBeenCalled();
  });
});
