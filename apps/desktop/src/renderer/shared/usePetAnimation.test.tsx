// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactThreeTest } from '@react-three/test-renderer';
import { Bounds, useGLTF } from '@react-three/drei';
import { useThree, type RootState } from '@react-three/fiber';
import { AnimationClip, VectorKeyframeTrack, type Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PetAnimations, PetMotion } from '@agent-pet/pet-runtime';
import { PetModel } from '../features/pet/PetModel.js';
import { usePetInteraction } from './usePetInteraction.js';
import { ScenePet } from '../management/ScenePet.js';

// Real GLTFLoader, production components, Drei mixer and R3F render ordering.
// Distinct synthetic poses make an accidental bind-pose frame observable; no GPU assertion.
vi.mock('@react-three/drei', async original => ({ ...await original<typeof import('@react-three/drei')>(), useGLTF: vi.fn() }));
let asset: { scene: Group; animations: AnimationClip[] };
const mounted: ReactThreeTest.Renderer[] = [];
beforeAll(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const bytes = Uint8Array.from(readFileSync('packages/pet-runtime/assets/starter.glb')).buffer;
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  asset = { scene: gltf.scene, animations: ([['IdlePose', 2, 3], ['WorkPose', 4, 5], ['HoverPose', 10, 12], ['ResultPose', 20, 22]] as const).map(([name, start, end]) =>
    new AnimationClip(name, 1, [new VectorKeyframeTrack('Pet.position', [0, 1], [start, 0, 0, end, 0, 0])])) };
});
afterAll(() => vi.unstubAllGlobals());
afterEach(async () => { for (const view of mounted.splice(0)) await view.unmount(); vi.restoreAllMocks(); });

async function mount(surface: 'desktop' | 'home', motion: PetMotion = 'idle') {
  vi.mocked(useGLTF).mockReturnValue(asset as ReturnType<typeof useGLTF>);
  let state!: RootState;
  function Probe() { state = useThree(); return null; }
  const ready = vi.fn();
  let props: { motion: PetMotion; restAction: PetMotion; replay: string; reduced: boolean; animations: PetAnimations; interactionActive: boolean } = {
    motion, restAction: 'idle', replay: '', reduced: false, interactionActive: true,
    animations: { idle: 'IdlePose', working: 'WorkPose', hover: 'HoverPose', success: 'ResultPose' },
  };
  let interaction!: ReturnType<typeof usePetInteraction>;
  function Desktop() {
    interaction = usePetInteraction(props.interactionActive && !props.reduced);
    return <Bounds><PetModel {...props} interaction={interaction.feedback} onInteractionFinished={interaction.finish} onReady={ready} modelUrl="blob:frame-poses" /></Bounds>;
  }
  const tree = () => <StrictMode><Probe />{surface === 'desktop'
    ? <Desktop />
    : <ScenePet {...props} action={props.motion} interactive={props.interactionActive} onReady={ready} modelUrl="blob:frame-poses" />}</StrictMode>;
  const view = await create(tree(), { frameloop: 'never' }); mounted.push(view);
  const root = state.scene.getObjectByName('Pet')!;
  const drawn: number[] = [];
  vi.spyOn(state.gl, 'render').mockImplementation(() => { drawn.push(root.position.x); });
  const target = view.scene.findByProps({ name: surface === 'desktop' ? 'pet-pointer-target' : 'scene-pet-pointer-target' });
  return { root, drawn, view, state,
    draw(delta: number) { state.advance(state.clock.elapsedTime + delta, false); },
    enter: () => surface === 'desktop' ? act(async () => interaction.hover(true)) : view.fireEvent(target, 'pointerOver', { stopPropagation() {} }),
    leave: () => surface === 'desktop' ? act(async () => interaction.hover(false)) : view.fireEvent(target, 'pointerOut', { intersections: [] }),
    update(next: Partial<typeof props>) { props = { ...props, ...next }; return view.update(tree()); },
  };
}

describe.each(['desktop', 'home'] as const)('%s one-shot render handoff', surface => {
  it.each(['idle', 'working'] as const)('holds the final hover pose through the completion draw and samples %s before the next frame', async motion => {
    const f = await mount(surface, motion);
    f.draw(0); expect(f.root.position.x).toBe(motion === 'idle' ? 2 : 4);
    await f.enter();
    f.draw(0); expect(f.root.position.x).toBe(10);
    f.draw(.5); expect(f.root.position.x).toBe(11);
    f.draw(.49); expect(f.root.position.x).toBeCloseTo(11.98);
    await act(async () => {
      f.draw(.01);
      // This is the pose sent to gl.render, before finished's microtask/React commit.
      expect(f.drawn.at(-1)).toBe(12);
      f.draw(.1); expect(f.drawn.at(-1)).toBe(12); // React has not released local feedback yet.
    });
    // Cleanup/setup has run, but no frame has advanced to hide a default-pose gap.
    expect(f.root.position.x).toBe(motion === 'idle' ? 2 : 4);
    f.draw(.1); expect(f.drawn.at(-1)).toBeCloseTo(motion === 'idle' ? 2.1 : 4.1);
    expect(f.drawn).not.toContain(0);
    await f.leave(); await f.enter();
    expect(f.root.position.x).toBe(10);
    f.draw(.5); expect(f.drawn.at(-1)).toBe(11);
    await f.view.unmount(); mounted.splice(mounted.indexOf(f.view), 1);
    expect(f.root.position.x).toBe(0);
    expect(f.state.internal.subscribers).toHaveLength(0);
  });

  it('hands off to a new business cue after hover, then to latest rest without replaying a consumed cue', async () => {
    const f = await mount(surface, 'working');
    await f.enter(); f.draw(.5);
    await f.update({ motion: 'success', replay: `finish-flash:${surface}`, restAction: 'working' });
    expect(f.root.position.x).toBe(11); // Business change did not restart hover or consume its cue.
    await act(async () => { f.draw(.6); expect(f.drawn.at(-1)).toBe(12); });
    expect(f.root.position.x).toBe(20);
    f.draw(.5); expect(f.drawn.at(-1)).toBe(21);
    await f.update({ restAction: 'idle' });
    expect(f.root.position.x).toBe(21);
    await act(async () => { f.draw(.5); expect(f.drawn.at(-1)).toBe(22); });
    expect(f.root.position.x).toBe(2);
    await f.leave(); await f.enter();
    await act(async () => { f.draw(1); expect(f.drawn.at(-1)).toBe(12); });
    expect(f.root.position.x).toBe(2); // Consumed result does not restart after another hover.
    f.draw(.1); expect(f.drawn.at(-1)).toBeCloseTo(2.1);
    expect(f.drawn).not.toContain(0);
  });

  it('releases the final pose to static when idle is absent and permits a fresh hover', async () => {
    const f = await mount(surface);
    await f.update({ animations: { hover: 'HoverPose' } });
    await f.enter(); f.draw(.5);
    await act(async () => { f.draw(.5); expect(f.drawn.at(-1)).toBe(12); });
    expect(f.root.position.x).toBe(0); // Deliberate fallback, not a frame between two mapped clips.
    f.draw(.1); expect(f.drawn.at(-1)).toBe(0);
    await f.leave(); await f.enter();
    f.draw(.5); expect(f.drawn.at(-1)).toBe(11);
  });

  it.each(['pointerOut', 'blur', 'pointercancel', 'lostpointercapture', 'visibilitychange', 'disabled', 'reduced'] as const)(
    'cancels hover on %s without leaving a default pose before the next draw', async event => {
      const f = await mount(surface, 'working');
      await f.enter(); f.draw(.5); expect(f.root.position.x).toBe(11);
      if (event === 'pointerOut') await f.leave();
      else if (event === 'disabled') await f.update({ interactionActive: false });
      else if (event === 'reduced') await f.update({ reduced: true });
      else await act(async () => {
        if (event === 'visibilitychange') vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event));
      });
      expect(f.root.position.x).toBe(4);
      f.draw(.1); expect(f.drawn.at(-1)).toBeCloseTo(event === 'reduced' ? 4 : 4.1);
      expect(f.drawn).not.toContain(0);
    });
});
