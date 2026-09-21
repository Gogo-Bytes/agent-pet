// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { parseBundledPet, type LoadedPet } from '@agent-pet/pet-runtime/model';
import { createPetStore } from '../../app/bridge/pet-store.js';
import { createPetBridgeDouble } from '../../test-support/pet-bridge-double.js';
import { piObservation } from '../../test-support/pi-fixtures.js';
import { PetCanvas } from './PetCanvas.js';
import { createPetScene } from './pet-scene.js';

const renderers = vi.hoisted(() => [] as Array<{ setSize: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>);
vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: vi.fn(function () {
    const renderer = { setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
    renderers.push(renderer);
    return renderer;
  }),
}));
vi.mock('@agent-pet/pet-runtime/model', () => ({ parseBundledPet: vi.fn() }));
const frames = new Map<number, FrameRequestCallback>();
const observers: Array<{ callback: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];
let loaded: LoadedPet;
let nextFrame = 0;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  loaded = { root: new Group(), setMotion: vi.fn(), update: vi.fn(), dispose: vi.fn() };
  vi.mocked(parseBundledPet).mockResolvedValue(loaded);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback); return nextFrame;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames.delete(id); }));
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn();
    observe = vi.fn();
    constructor(callback: () => void) { observers.push({ callback, disconnect: this.disconnect }); }
  });
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks();
  frames.clear(); renderers.length = 0; observers.length = 0;
});

describe('R1 pet scene ownership', () => {
  it('StrictMode recreates one scene, leaves one RAF/loader/listener pair and disposes all resources on unmount', async () => {
    const bridge = createPetBridgeDouble({ observations: [piObservation()] });
    const store = createPetStore(bridge.api);
    const notice = vi.fn();
    const view = render(<StrictMode><PetCanvas store={store} rect={undefined} onNotice={notice} /></StrictMode>);
    await act(flush);
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
    expect(renderers).toHaveLength(2);
    expect(renderers[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(renderers[1]!.dispose).not.toHaveBeenCalled();
    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(parseBundledPet).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
    expect(bridge.listenerCounts()).toEqual({ snapshot: 1, layout: 1 });
    expect(loaded.setMotion).toHaveBeenLastCalledWith('working');
    act(() => bridge.observe(piObservation({ status: 'completed', revision: 2 })));
    expect(loaded.setMotion).toHaveBeenLastCalledWith('success');
    const [id, callback] = [...frames][0]!;
    frames.delete(id);
    callback(40);
    expect(loaded.update).toHaveBeenCalledWith(.04);
    expect(renderers[1]!.render).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
    observers[1]!.callback();
    expect(renderers[1]!.setSize).toHaveBeenCalledTimes(2);
    const sizeCalls = renderers[1]!.setSize.mock.calls.length;
    view.unmount();
    window.dispatchEvent(new Event('resize'));
    expect(renderers[1]!.setSize).toHaveBeenCalledTimes(sizeCalls);
    expect(renderers[1]!.dispose).toHaveBeenCalledTimes(1);
    expect(loaded.dispose).toHaveBeenCalledTimes(1);
    expect(observers[1]!.disconnect).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
    expect(vi.mocked(fetch).mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });

  it('disposes a late parsed GLB without attaching it or updating notices', async () => {
    let resolve!: (pet: LoadedPet) => void;
    vi.mocked(parseBundledPet).mockImplementation(() => new Promise(done => { resolve = done; }));
    const bridge = createPetBridgeDouble();
    const notice = vi.fn();
    const dispose = createPetScene(document.createElement('canvas'), createPetStore(bridge.api), notice);
    await flush();
    dispose(); dispose();
    resolve(loaded);
    await flush();
    expect(loaded.dispose).toHaveBeenCalledTimes(1);
    expect(loaded.setMotion).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledTimes(1);
    expect(renderers[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('reports load failure and can still clean up its RAF and bridge listeners', async () => {
    vi.mocked(fetch).mockRejectedValue(Error('missing GLB'));
    const bridge = createPetBridgeDouble();
    const notice = vi.fn();
    const dispose = createPetScene(document.createElement('canvas'), createPetStore(bridge.api), notice);
    await flush();
    expect(notice).toHaveBeenLastCalledWith('内置宠物加载失败，请重新打开窗口。');
    expect(parseBundledPet).not.toHaveBeenCalled();
    dispose();
    expect(frames.size).toBe(0);
    expect(bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
  });
});
