import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactThreeTest } from '@react-three/test-renderer';
import { useGLTF } from '@react-three/drei';
import { useThree, type RootState } from '@react-three/fiber';
import { Box3, Group, Mesh, Vector3, type AnimationClip } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ScenePet } from './ScenePet.js';
import { HomeScene, PetPreviewScene } from './ManagementScenes.js';

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
  it.each([[1280, 720], [390, 700], [1000, 360], [390, 350]])('switches home to a centered pet-only scene at %sx%s without replacing the R3F root', async (width, height) => {
    vi.mocked(useGLTF).mockReturnValue(asset as ReturnType<typeof useGLTF>);
    let state!: RootState;
    function Probe() { state = useThree(); return null; }
    const ready = vi.fn(); const focused = vi.fn();
    const pets = ['a', 'b'].map(id => ({ id, agent: 'pi', name: id, configuration: id, status: '陪伴中', action: 'Idle' }));
    const view = await create(<><Probe /><HomeScene pets={pets} focused={null} reduced onFocus={focused} onReady={ready} /></>, { camera: { position: [0, 4.5, 10], fov: 38 } });
    mounted.push(view);
    await act(async () => state.setSize(width, height));
    const camera = state.camera, scene = state.scene;
    await view.advanceFrames(1, .1);
    expect(scene.getObjectByName('home-floor')).toBeTruthy();
    await view.fireEvent(view.scene.findByProps({ name: 'a' }), 'click', { stopPropagation() {} });
    expect(focused).toHaveBeenCalledWith('a');
    await view.update(<><Probe /><PetPreviewScene action="Idle" replay={0} reduced onReady={ready} /></>);
    await view.advanceFrames(1, .1);
    expect(state.scene).toBe(scene); expect(state.camera).toBe(camera);
    expect(scene.getObjectByName('home-floor')).toBeUndefined();
    expect(scene.getObjectByName('a')).toBeUndefined();
    expect(scene.getObjectByName('b')).toBeUndefined();
    expect(scene.getObjectByName('pet-preview-scene')).toBeTruthy();
    camera.updateMatrixWorld();
    const center = new Vector3(0, 1.05, 0).project(camera);
    expect(center.x).toBeCloseTo(0, 5); expect(center.y).toBeCloseTo(0, 5);
    const bounds = new Box3().setFromObject(scene.getObjectByName('pet-preview-scene')!);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new Vector3(x, y, z).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1);
    }
    expect(state.internal.subscribers).toHaveLength(2); // one camera rig and one actual mixer
    await view.update(<><Probe /><HomeScene pets={pets} focused="b" reduced onFocus={focused} onReady={ready} /></>);
    await view.advanceFrames(1, .1);
    expect(scene.getObjectByName('home-floor')).toBeTruthy();
    expect(scene.getObjectByName('pet-preview-scene')).toBeUndefined();
    expect(state.internal.subscribers).toHaveLength(3); // one camera, two independent mixers
    await view.unmount(); mounted.splice(mounted.indexOf(view), 1);
    expect(state.internal.subscribers).toHaveLength(0);
  });
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
  it('falls back to a finite neutral transform for a zero-size imported model', async () => {
    const malformed = { scene: new Group(), animations: [] };
    vi.mocked(useGLTF).mockReturnValue(malformed as ReturnType<typeof useGLTF>);
    let state!: RootState;
    function Probe() { state = useThree(); return null; }
    const view = await create(<><Probe /><ScenePet action="Idle" reduced={false} onReady={vi.fn()} modelUrl="blob:malformed" /></>);
    mounted.push(view);
    const pet = state.scene.children.find(child => child.type === 'Group');
    expect(pet).toBeTruthy();
    expect(Number.isFinite(pet!.scale.x)).toBe(true);
    expect(Number.isFinite(pet!.position.y)).toBe(true);
  });

  it('exposes only available clip capabilities and uses actual Idle when an optional action is absent', async () => {
    const test = await mount([{ id: 'a', action: 'Work' }], asset.animations.filter(clip => clip.name === 'Idle'));
    expect(test.ready).toHaveBeenCalledWith(['idle']);
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
  it('renders a static asset and publishes an empty available action list', async () => {
    const test = await mount([{ id: 'a', action: 'Work' }], []);
    expect(test.ready).toHaveBeenCalledWith([]);
    for (const action of ['Work', 'Error', 'unrecognized', 'Idle']) {
      await test.update([{ id: 'a', action }]); await test.view.advanceFrames(5, .1);
      expect(test.root('a').position.toArray()).toEqual([0, 0, 0]);
    }
  });
  it('restores the static pose rather than retaining an unsupported working pose', async () => {
    const test = await mount([{ id: 'a', action: 'Work' }], asset.animations.filter(clip => clip.name === 'Work'));
    await test.view.advanceFrames(3, .1); expect(test.root('a').position.y).toBeGreaterThan(0);
    await test.update([{ id: 'a', action: 'Error' }]); await test.view.advanceFrames(4, .1);
    expect(test.root('a').position.toArray()).toEqual([0, 0, 0]);
  });
});
