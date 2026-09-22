// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Theme } from '@radix-ui/themes';
import { PiPreflightPanel } from './PiPreflightPanel.js';
import { initialPreflight, preflightBridge } from './test-preflight.js';
import type { PreflightState } from '../../shared/pi-preflight.js';
afterEach(cleanup);
const candidate = { id: 'opaque-id', path: '/synthetic/pi', compatibility: 'verified-0.85.1' as const, version: '0.85.1' };
function deferred() { let resolve!: (value: PreflightState) => void; const promise = new Promise<PreflightState>(done => { resolve = done; }); return { promise, resolve }; }
describe('PiPreflightPanel real DOM controls', () => {
  it('detects, selects installation, picks target and explicitly inspects with fixed capabilities', async () => {
    const api = preflightBridge(); const user = userEvent.setup();
    const detected = { ...initialPreflight, scan: 'complete' as const, installations: [candidate] };
    api.detect.mockResolvedValue(detected);
    api.selectInstallation.mockResolvedValue({ ...detected, selectedInstallation: candidate.id });
    const selected = { ...detected, selectedInstallation: candidate.id, target: { path: '/synthetic/custom', source: 'chosen' as const } };
    api.chooseTarget.mockResolvedValue(selected);
    api.inspect.mockResolvedValue({ ...selected, inspection: { target: selected.target, findings: ['root-entry', 'ignore-unknown', 'existing-extension'] } });
    render(<Theme><PiPreflightPanel api={api} /></Theme>); await act(async () => {});
    expect(api.inspect).not.toHaveBeenCalled(); expect(api.detect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '检测 / 重新扫描' }));
    await user.click(screen.getByRole('radio'));
    expect(api.selectInstallation).toHaveBeenCalledExactlyOnceWith('opaque-id');
    await user.click(screen.getByRole('button', { name: '选择配置目录' }));
    expect(screen.getByText('/synthetic/custom')).toBeTruthy(); expect(api.inspect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '检查所选目标（只读）' }));
    expect(api.inspect).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByText(/根 index.ts/)).toBeTruthy(); expect(screen.getByText(/发现 ignore 文件/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /安装扩展|连接|修复/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: '选择安装包目录' })); expect(api.chooseInstallation).toHaveBeenCalledExactlyOnceWith();
    await user.click(screen.getByRole('button', { name: '使用默认候选' })); expect(api.useDefaultTarget).toHaveBeenCalledExactlyOnceWith();
  });
  it('uses the real Themes radio group keyboard selection and preserves candidate identity labels', async () => {
    const api = preflightBridge(); const user = userEvent.setup();
    const second = { ...candidate, id: 'other-id', path: '/synthetic/other', compatibility: 'unverified' as const, version: '0.86.0' };
    const state = { ...initialPreflight, installations: [candidate, second], selectedInstallation: candidate.id };
    api.getState.mockResolvedValue(state);
    api.selectInstallation.mockResolvedValue({ ...state, selectedInstallation: second.id });
    render(<Theme><PiPreflightPanel api={api} /></Theme>); await act(async () => {});
    const firstRadio = screen.getByRole('radio', { name: /synthetic\/pi.*标准 pi 0.85.1/ });
    const secondRadio = screen.getByRole('radio', { name: /synthetic\/other.*未验证/ });
    expect(firstRadio.getAttribute('aria-checked')).toBe('true');
    firstRadio.focus();
    // Radix moves roving focus in a timer; keep the arrow held through that focus.
    await user.keyboard('{ArrowDown>}');
    expect(document.activeElement).toBe(secondRadio);
    await user.keyboard('{/ArrowDown}');
    expect(api.selectInstallation).toHaveBeenCalledExactlyOnceWith('other-id');
    expect(secondRadio.getAttribute('aria-checked')).toBe('true');
    expect(firstRadio.getAttribute('aria-checked')).toBe('false');
    expect(api.inspect).not.toHaveBeenCalled();
  });
  it('does not let deferred inspection or initial snapshot overwrite a newer selection', async () => {
    const api = preflightBridge(); const pending = deferred(); const initial = deferred();
    api.getState.mockReturnValue(initial.promise); api.inspect.mockReturnValue(pending.promise);
    const chosen = { ...initialPreflight, target: { path: '/synthetic/new', source: 'chosen' as const } };
    api.detect.mockResolvedValue(initialPreflight); api.chooseTarget.mockResolvedValue(chosen);
    const user = userEvent.setup(); render(<Theme><PiPreflightPanel api={api} /></Theme>);
    await user.click(screen.getByRole('button', { name: '检测 / 重新扫描' }));
    await user.click(screen.getByRole('button', { name: '检查所选目标（只读）' }));
    await user.click(screen.getByRole('button', { name: '选择配置目录' }));
    await act(async () => { pending.resolve({ ...initialPreflight, inspection: { target: initialPreflight.target, findings: ['unsafe'] } }); initial.resolve(initialPreflight); });
    expect(screen.getByText('/synthetic/new')).toBeTruthy(); expect(screen.queryByLabelText('预检结果')).toBeNull();
  });
  it('shows cancellation, unknown version and sanitized error, and ignores replies after unmount', async () => {
    const api = preflightBridge(); const user = userEvent.setup();
    api.chooseInstallation.mockResolvedValue({ ...initialPreflight, installations: [{ ...candidate, compatibility: 'unverified', version: '0.86.0' }] });
    api.chooseTarget.mockResolvedValue({ ...initialPreflight, notice: 'cancelled' });
    const view = render(<Theme><PiPreflightPanel api={api} /></Theme>); await act(async () => {});
    await user.click(screen.getByRole('button', { name: '选择安装包目录' }));
    expect(screen.getByText(/未验证 \/ 待支持 · 0.86.0/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '选择配置目录' }));
    expect(screen.getByRole('status').classList.contains('rt-CalloutRoot')).toBe(true);
    expect(screen.getByText('已取消选择；目标未更改。')).toBeTruthy();
    api.detect.mockRejectedValueOnce(new Error('SECRET_RAW_ERROR'));
    await user.click(screen.getByRole('button', { name: '检测 / 重新扫描' }));
    expect(screen.getByRole('alert').classList.contains('rt-CalloutRoot')).toBe(true);
    expect(screen.getByRole('alert').textContent).not.toContain('SECRET_RAW_ERROR');
    const pending = deferred(); api.detect.mockReturnValueOnce(pending.promise);
    await user.click(screen.getByRole('button', { name: '检测 / 重新扫描' })); view.unmount();
    await act(async () => pending.resolve(initialPreflight)); expect(screen.queryByLabelText('pi 只读预检')).toBeNull();
  });
});
