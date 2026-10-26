// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../../shared/preferences.js';
import { CompanionScene } from './CompanionScene.js';

vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../shared/PreferenceRenderLoop.js', () => ({ PreferenceRenderLoop: () => null }));
vi.mock('./ManagementScenes.js', () => ({
  HomeScene: () => null,
  PetPreviewScene: ({ modelUrl }: { modelUrl?: string }) => {
    if (modelUrl === 'blob:broken') throw new Error('fixture model failed');
    return <span>loaded:{modelUrl ?? 'starter'}</span>;
  },
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('keeps controls usable after model failure and recovers when the asset changes', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const props = { pets: [], page: 'pets', preferences: defaultPreferences, action: 'idle', replay: 0, onClips: vi.fn(), children: <button>选择宠物</button> };
  const view = render(<CompanionScene {...props} modelUrl="blob:broken" />);
  expect(screen.getByRole('alert').textContent).toContain('宠物加载失败');
  expect(screen.getByRole('button', { name: '选择宠物' })).toBeTruthy();
  view.rerender(<CompanionScene {...props} />);
  expect(screen.getByText('loaded:starter')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
