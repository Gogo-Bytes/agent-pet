// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Children, isValidElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../../shared/preferences.js';
import { CompanionScene } from './CompanionScene.js';
import { HomeScene } from './ManagementScenes.js';
import { userEvent } from '@testing-library/user-event';

vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }: { children: ReactNode }) => <div>{Children.toArray(children).filter(child => isValidElement(child) && typeof child.type !== 'string')}</div> }));
vi.mock('../shared/PreferenceRenderLoop.js', () => ({ PreferenceRenderLoop: () => null }));
vi.mock('./ManagementScenes.js', () => ({
  HomeScene: vi.fn(() => null),
  PetPreviewScene: ({ modelUrl }: { modelUrl?: string }) => {
    if (modelUrl === 'blob:broken') throw new Error('fixture model failed');
    return <span>loaded:{modelUrl ?? 'starter'}</span>;
  },
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it('sends explicit model-click and keyboard selection edges, never focus or passive renders, and cancels on overview/page exit', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const user = userEvent.setup();
  const pets = ['a', 'b'].map(id => ({ id, agent: 'pi', name: id, configuration: id, status: '陪伴中', action: 'idle' }));
  const props = { pets, page: 'home', preferences: defaultPreferences, action: 'idle', replay: 0, onClips: vi.fn(), children: null };
  const view = render(<CompanionScene {...props} />);
  const scene = () => vi.mocked(HomeScene).mock.calls.at(-1)![0];
  expect(scene().selection).toBeNull();
  const button = screen.getByRole('button', { name: '聚焦 pi 的a（a）' });
  act(() => button.focus()); expect(scene().selection).toBeNull();
  await user.keyboard('{Enter}'); expect(scene().selection).toEqual({ id: 'a', sequence: 1 });
  view.rerender(<CompanionScene {...props} pets={[...pets]} />);
  expect(scene().selection).toEqual({ id: 'a', sequence: 1 });
  await user.keyboard(' '); expect(scene().selection).toEqual({ id: 'a', sequence: 2 });
  act(() => scene().onFocus('b')); expect(scene().selection).toEqual({ id: 'b', sequence: 3 });
  act(() => scene().onFocus('b')); expect(scene().selection).toEqual({ id: 'b', sequence: 4 });
  fireEvent.keyDown(window, { key: 'Escape' }); expect(scene().selection).toBeNull();
  act(() => scene().onFocus('a'));
  await user.click(screen.getByRole('button', { name: '返回全景' })); expect(scene().selection).toBeNull();
  act(() => scene().onFocus('a'));
  view.rerender(<CompanionScene {...props} page="connections" />);
  expect(scene().selection).toBeNull(); expect(scene().interactive).toBe(false);
  view.rerender(<CompanionScene {...props} />); expect(scene().selection).toBeNull();
});
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
