// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { afterEach, expect, it } from 'vitest';
import { PiConnectionPanel } from './PiConnectionPanel.js';
import { connectionBridge, initialConnection } from './test-connection.js';
import type { PiConnectionState } from '../../shared/pi-connection.js';

afterEach(cleanup);
const preview: PiConnectionState = { ...initialConnection, revision: 2, preview: { id: 'opaque-plan',
  target: { path: '/fixture/target', source: 'chosen' }, path: '/fixture/target/extensions/agent-pet.ts', action: 'create',
  findings: [], createDirectories: ['/fixture/target/extensions'] } };

it('is inert on mount, requires separate read/preview and confirm consent, and cancels without confirming', async () => {
  const api = connectionBridge(); api.preview.mockResolvedValue(preview);
  api.cancel.mockResolvedValue({ ...initialConnection, revision: 3 });
  render(<Theme><PiConnectionPanel api={api} /></Theme>);
  const user = userEvent.setup(); await act(async () => {});
  expect(api.preview).not.toHaveBeenCalled(); expect(api.confirm).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: '部署预览' })).toBeNull();
  expect(screen.getByText(/仅本进程持有凭据/).textContent).toContain('退出 / 重启后不会自动重连');
  await user.click(screen.getByRole('button', { name: '同意读取所选目标并预览部署' }));
  expect(screen.getByRole('region', { name: '部署预览' }).textContent).toContain('/fixture/target/extensions/agent-pet.ts');
  expect(api.confirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '取消预览' }));
  expect(api.cancel).toHaveBeenCalledOnce(); expect(api.confirm).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: '部署预览' })).toBeNull();
});

it('bounds repeated confirm, renders honest connection statuses, and requires explicit removal confirmation', async () => {
  const api = connectionBridge(); api.getState.mockResolvedValue(preview);
  let finish!: (state: PiConnectionState) => void;
  api.confirm.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Theme><PiConnectionPanel api={api} /></Theme>);
  const user = userEvent.setup(); await act(async () => {});
  await user.dblClick(screen.getByRole('button', { name: '确认部署并开始接收' }));
  expect(api.confirm).toHaveBeenCalledExactlyOnceWith('opaque-plan');
  const deployed: PiConnectionState = { ...initialConnection, revision: 3, status: 'configured-waiting',
    deployedPath: preview.preview!.path, canConfigure: false, canRemove: true };
  await act(async () => finish(deployed));
  expect(screen.getByText('连接状态：已配置，等待加载 / 连接')).toBeTruthy();
  for (const [index, status, text] of [[4, 'connected', '已连接（收到 legacy hello）'], [5, 'disconnected', '连接已断开'], [6, 'failed', '失败']] as const) {
    act(() => api.push({ ...deployed, revision: index, status }));
    expect(screen.getByText(`连接状态：${text}`)).toBeTruthy();
  }
  await user.click(screen.getByRole('button', { name: '停用接收并撤回本次文件…' }));
  expect(api.remove).not.toHaveBeenCalled();
  expect(screen.getByText(/仅移除仍匹配/).textContent).toContain('不表示运行中扩展已卸载');
  api.remove.mockResolvedValue({ ...initialConnection, revision: 7, canConfigure: false, notice: 'removed' });
  await user.click(screen.getByRole('button', { name: '确认停用并选择性移除' }));
  expect(api.remove).toHaveBeenCalledOnce();
  expect(screen.getByText(/本次扩展文件已移除/)).toBeTruthy();
});

it('a pushed invalidation wins over stale IPC replies and blocked/env modes cannot confirm', async () => {
  const api = connectionBridge(); api.getState.mockResolvedValue(preview);
  let finish!: (state: PiConnectionState) => void;
  api.preview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Theme><PiConnectionPanel api={api} /></Theme>);
  const user = userEvent.setup(); await act(async () => {});
  await user.click(screen.getByRole('button', { name: '同意读取所选目标并预览部署' }));
  act(() => api.push({ ...initialConnection, revision: 10 }));
  await act(async () => finish(preview));
  expect(screen.queryByRole('button', { name: '确认部署并开始接收' })).toBeNull();
  act(() => api.push({ ...preview, revision: 11, preview: { ...preview.preview!, action: 'blocked', findings: ['existing-extension'] } }));
  expect((screen.getByRole('button', { name: '确认部署并开始接收' }) as HTMLButtonElement).disabled).toBe(true);
  act(() => api.push({ ...initialConnection, revision: 12, mode: 'development-env', canConfigure: false }));
  expect((screen.getByRole('button', { name: '同意读取所选目标并预览部署' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/不会替换、回退或创建第二个桥接/)).toBeTruthy();
});
