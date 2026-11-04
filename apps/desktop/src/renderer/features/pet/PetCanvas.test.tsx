// @vitest-environment jsdom
import '../../test-support/dom-platform.js';
import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, waitFor, configure, getConfig } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { create } from '@react-three/test-renderer';
import { _roots } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationClip, VectorKeyframeTrack, type Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { App } from '../../app/App.js';
import { createPetStore } from '../../app/bridge/pet-store.js';
import { createPetBridgeDouble } from '../../test-support/pet-bridge-double.js';
import { defaultPreferences } from '../../../shared/preferences.js';
import { piObservation } from '../../test-support/pi-fixtures.js';

// Real DOM Canvas, Fiber raycasts and production player; only GPU and asset IO are substituted.
vi.mock('@react-three/drei', async original => ({ ...await original<typeof import('@react-three/drei')>(), useGLTF: vi.fn() }));
let asset: { scene: Group; animations: AnimationClip[] };
const getContext = HTMLCanvasElement.prototype.getContext;
const asyncWrapper = getConfig().asyncWrapper;
beforeAll(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  // Test-renderer's canvas installs its existing WebGL stub for the real DOM Canvas too.
  const gpu = await create(<group />); await gpu.unmount();
  const bytes = Uint8Array.from(readFileSync('packages/pet-runtime/assets/starter.glb')).buffer;
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  asset = { scene: gltf.scene, animations: [
    new AnimationClip('IdlePose', 1, [new VectorKeyframeTrack('Pet.position', [0, 1], [0, 0, 0, 0, 0, 0])]),
    new AnimationClip('HoverPose', 1, [new VectorKeyframeTrack('Pet.position', [0, 1], [0, 0, 0, 10, 0, 0])]),
    new AnimationClip('WorkPose', 1, [new VectorKeyframeTrack('Pet.position', [0, 1], [2, 0, 0, 3, 0, 0])]),
    new AnimationClip('ResultPose', 1, [new VectorKeyframeTrack('Pet.position', [0, 1], [20, 0, 0, 22, 0, 0])]),
    new AnimationClip('DragPose', 1, [new VectorKeyframeTrack('Pet.position', [0, 1], [30, 0, 0, 31, 0, 0])]),
  ] };
});
afterAll(() => { configure({ asyncWrapper }); HTMLCanvasElement.prototype.getContext = getContext; vi.unstubAllGlobals(); });
afterEach(async () => { await act(async () => cleanup()); configure({ asyncWrapper }); vi.restoreAllMocks(); });

function pointerUser() {
  // DOM events schedule a second React root in Canvas; drain both before sampling a pose.
  configure({ asyncWrapper: async callback => {
    let result: Awaited<ReturnType<typeof callback>>;
    await act(async () => { result = await callback(); });
    return result!;
  } });
  return userEvent.setup();
}

let sequence = 0;
async function mount(working = false) {
  const sessionId = `viewport-work:${++sequence}`;
  const resize = new Set<() => void>();
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) {}
    observe() { resize.add(this.callback); }
    unobserve() {}
    disconnect() { resize.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 140, 140));
  let assetSequence = 0;
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => `blob:hover-viewport:${++assetSequence}`, revokeObjectURL() {} });
  vi.mocked(useGLTF).mockReturnValue(asset as ReturnType<typeof useGLTF>);
  const bridge = createPetBridgeDouble(working ? { observations: [piObservation({ sessionId })] } : {});
  bridge.publishPreferences({ ...defaultPreferences, petAssetId: 'viewport-fixture' });
  const api = { ...bridge.api, getAsset: vi.fn(async () => ({ bytes: new Uint8Array([1]), animations: { idle: 'IdlePose', working: 'WorkPose', hover: 'HoverPose', success: 'ResultPose', dragging: 'DragPose' } })) };
  const view = render(<StrictMode><App store={createPetStore(api)} /></StrictMode>);
  const canvas = view.container.querySelector('canvas')!;
  await act(async () => { for (const callback of resize) callback(); });
  await waitFor(() => expect(_roots.get(canvas)?.store.getState().scene.getObjectByName('Pet')).toBeTruthy());
  const state = _roots.get(canvas)!.store.getState();
  const root = state.scene.getObjectByName('Pet')!;
  async function pointer(type: string, x: number, y: number, relatedTarget: EventTarget | null = null) {
    const event = new window.PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', relatedTarget });
    Object.defineProperties(event, { offsetX: { value: x }, offsetY: { value: y } });
    await act(async () => { fireEvent(canvas, event); });
  }
  function draw(delta: number) { state.advance(state.clock.elapsedTime + delta, false); state.scene.updateMatrixWorld(true); }
  draw(0);
  const drawn: number[] = [];
  vi.spyOn(state.gl, 'render').mockImplementation(() => { drawn.push(root.position.x); });
  return { ...view, state, root, canvas, bridge, pointer, draw, drawn, sessionId };
}

it('starts desktop hover on the pet viewport even when the real raycast misses the model', async () => {
  const f = await mount();
  await f.pointer('pointerover', 1, 1); await f.pointer('pointermove', 1, 1);
  expect(f.state.raycaster.intersectObject(f.root, true)).toHaveLength(0);
  f.draw(.25);
  expect(f.root.position.x).toBeCloseTo(2.5);
});

it('does not interrupt desktop hover when animated geometry moves away from a stationary cursor', async () => {
  const f = await mount();
  await f.pointer('pointerover', 70, 70); await f.pointer('pointermove', 70, 70);
  expect(f.state.raycaster.intersectObject(f.root, true).length).toBeGreaterThan(0);
  f.draw(.25); expect(f.root.position.x).toBeCloseTo(2.5);
  await f.pointer('pointermove', 70, 70); // Same viewport point, but the animated model is elsewhere.
  expect(f.state.raycaster.intersectObject(f.root, true)).toHaveLength(0);
  f.draw(.25); expect(f.root.position.x).toBeCloseTo(5);
});

it('ignores internal DOM/mesh transitions and ordinary rerenders, then rearms only on a real viewport exit', async () => {
  const f = await mount();
  const viewport = f.container.querySelector('.pet-canvas')!;
  await f.pointer('pointerover', 1, 1); f.draw(.2);
  // Canvas sizing div and canvas are within the same hover owner.
  await f.pointer('pointerout', 1, 1, viewport);
  await f.pointer('pointerover', 1, 1, viewport);
  await f.pointer('pointermove', 70, 70);
  await act(async () => f.bridge.publishPreferences({ ...defaultPreferences, petAssetId: 'viewport-fixture', petName: 'renamed' }));
  f.draw(.2); expect(f.root.position.x).toBeCloseTo(4);
  await act(async () => { f.draw(.6); expect(f.drawn.at(-1)).toBe(10); });
  expect(f.root.position.x).toBe(0);
  await f.pointer('pointermove', 70, 70); f.draw(.2);
  expect(f.root.position.x).toBe(0); // No hover storm while the cursor stays in the viewport.
  await f.pointer('pointerout', 141, 70, document.body);
  await f.pointer('pointerover', 1, 1); f.draw(.2);
  expect(f.root.position.x).toBeCloseTo(2);
  await f.pointer('pointerout', 141, 70, document.body);
  expect(f.root.position.x).toBe(0); // A real viewport leave still cancels.
  await f.pointer('pointerover', 1, 1); f.draw(.1);
  expect(f.root.position.x).toBeCloseTo(1); // A quick deliberate reentry starts a fresh once, no queue.
});

it('keeps toolbar, resize handle and their connecting envelope outside the pet hover area', async () => {
  const f = await mount();
  const user = pointerUser();
  for (const target of [f.container.querySelector('[data-pet-controls-region]')!,
    f.getByRole('toolbar', { name: '桌宠快捷操作' }), f.getByRole('button', { name: '调整宠物窗口大小' })]) {
    await user.hover(target); f.draw(.2); expect(f.root.position.x).toBe(0);
    await user.unhover(target);
  }
  await user.hover(f.canvas); f.draw(.2); expect(f.root.position.x).toBeCloseTo(2);
  await user.hover(f.getByRole('toolbar', { name: '桌宠快捷操作' }));
  expect(f.root.position.x).toBe(0);
});

it('defers the latest business cue while viewport hover runs and retains the completion-frame handoff fix', async () => {
  const f = await mount(true);
  await f.pointer('pointerover', 1, 1); f.draw(.2);
  await act(async () => f.bridge.observe(piObservation({ sessionId: f.sessionId, status: 'completed', revision: 2 })));
  expect(f.root.position.x).toBeCloseTo(2);
  f.draw(.3); expect(f.root.position.x).toBeCloseTo(5);
  await act(async () => { f.draw(.5); expect(f.drawn.at(-1)).toBe(10); });
  expect(f.root.position.x).toBe(20); // Immediately sampled; neither bind pose nor early cue consumption.
  await act(async () => { f.draw(1); expect(f.drawn.at(-1)).toBe(22); });
  expect(f.root.position.x).toBe(0);
  await f.pointer('pointerout', 141, 70, document.body); await f.pointer('pointerover', 1, 1);
  await act(async () => { f.draw(1); expect(f.drawn.at(-1)).toBe(10); });
  expect(f.root.position.x).toBe(0); // Consumed result is not replayed after another hover.
});

it.each(['blur', 'pointercancel', 'lostpointercapture', 'hidden', 'reduced'] as const)(
  'retains hard cancellation on %s and does not leave a clamped hover pose behind', async reason => {
    const f = await mount(true);
    await f.pointer('pointerover', 1, 1); f.draw(.4); expect(f.root.position.x).toBeCloseTo(4);
    await act(async () => {
      if (reason === 'reduced') f.bridge.publishPreferences({ ...defaultPreferences, petAssetId: 'viewport-fixture', reduced: true });
      else if (reason === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
      } else (reason === 'blur' ? window : f.canvas).dispatchEvent(new Event(reason, { bubbles: true }));
    });
    expect(f.root.position.x).toBe(2); // Latest work is already sampled before a new frame.
    await act(async () => f.unmount());
    expect(f.root.position.x).toBe(0);
    expect(f.state.internal.subscribers).toHaveLength(0);
    expect(f.bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
  });

it('hands off to dragging on actual movement and does not revive covered hover after release', async () => {
  const f = await mount(true);
  const user = pointerUser();
  await user.pointer({ target: f.canvas, coords: { screenX: 100, screenY: 100 } });
  f.draw(.4); expect(f.root.position.x).toBeCloseTo(4);
  await user.pointer({ target: f.canvas, keys: '[MouseLeft>]', coords: { screenX: 100, screenY: 100 } });
  f.draw(.1); expect(f.root.position.x).toBeCloseTo(5); // Press alone is not dragging.
  await user.pointer({ target: f.canvas, coords: { screenX: 110, screenY: 100 } });
  expect(f.root.position.x).toBe(30);
  await act(async () => f.bridge.observe(piObservation({ sessionId: f.sessionId, status: 'completed', revision: 2 })));
  await user.pointer({ target: f.canvas, coords: { screenX: 105, screenY: 100 } });
  f.draw(.2); expect(f.root.position.x).toBeCloseTo(30.2);
  await user.pointer({ target: f.canvas, keys: '[/MouseLeft]' });
  expect(f.root.position.x).toBe(20);
  expect(f.bridge.api.interaction.mock.calls).toEqual([[true], [false]]);
});

it('discards local feedback when the model is replaced and requires a new viewport entry', async () => {
  const f = await mount();
  await f.pointer('pointerover', 1, 1); f.draw(.4); expect(f.root.position.x).toBeCloseTo(4);
  await act(async () => f.bridge.publishPreferences({ ...defaultPreferences, petAssetId: 'replacement-pet' }));
  const replacement = f.state.scene.getObjectByName('Pet')!;
  expect(replacement).not.toBe(f.root);
  f.draw(.2); expect(replacement.position.x).toBe(0);
  await f.pointer('pointermove', 70, 70); f.draw(.1);
  expect(replacement.position.x).toBe(0);
  await f.pointer('pointerout', 141, 70, document.body); await f.pointer('pointerover', 1, 1);
  f.draw(.2); expect(replacement.position.x).toBeCloseTo(2);
});
