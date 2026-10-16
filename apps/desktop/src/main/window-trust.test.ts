import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { loadTrustedEntry } from './window-trust.js';

function fixture(zoom: { factor: number }) {
  const contents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: vi.fn(),
    setZoomFactor: vi.fn((factor: number) => { zoom.factor = factor; }),
  });
  const window = { webContents: contents, loadURL: vi.fn(async () => {}), loadFile: vi.fn(async () => {}) };
  return { contents, window: window as unknown as BrowserWindow };
}

describe('trusted app entry scale', () => {
  it.each([undefined, 'http://localhost:5174/management.html'])('restores actual CSS pixel size after loading %s', url => {
    const zoom = { factor: 1.2 ** -1.5 };
    const { window, contents } = fixture(zoom);
    loadTrustedEntry(window, '/tmp/agent-pet/management.html', url);
    contents.emit('did-finish-load');
    expect(zoom.factor).toBe(1);
    // Chromium can restore host zoom on subsequent navigation/reload too.
    zoom.factor = 0.5;
    contents.emit('did-finish-load');
    expect(zoom.factor).toBe(1);
  });
  it('keeps desktop and management at the same size and ignores wheel zoom requests', () => {
    const zoom = { factor: 0.5 };
    const pet = fixture(zoom), management = fixture(zoom);
    loadTrustedEntry(pet.window, '/tmp/agent-pet/index.html', 'http://localhost:5174/');
    loadTrustedEntry(management.window, '/tmp/agent-pet/management.html', 'http://localhost:5174/management.html');
    pet.contents.emit('did-finish-load');
    management.contents.emit('did-finish-load');
    expect(zoom.factor).toBe(1);
    zoom.factor = 0.75;
    pet.contents.emit('zoom-changed', {}, 'out');
    expect(zoom.factor).toBe(1);
    zoom.factor = 1.2;
    management.contents.emit('zoom-changed', {}, 'in');
    expect(zoom.factor).toBe(1);
  });
});
