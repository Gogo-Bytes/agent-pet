// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeConnectionState } from '../../shared/claude-connection.js';
import type { AgentConfiguration } from '../../shared/configurations.js';
import { ManagementApp } from './ManagementApp.js';
import { managementBridge, configuration } from './test-management.js';
import type { HomePet } from './CompanionScene.js';

vi.mock('./CompanionScene.js', () => ({ CompanionScene: ({ children, pets, page }: { children: ReactNode; pets: HomePet[]; page: string }) => <section aria-label="正式场景测试边界"><div hidden={page !== 'pets'}>{children}</div><div hidden={page !== 'home'}>{pets.map(pet => <span key={pet.id} data-pet={pet.id}>{pet.configuration}：{pet.status}</span>)}</div></section> }));
for (const method of ['showModal', 'close'] as const) {
  if (!HTMLDialogElement.prototype[method]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} });
}
if (!HTMLElement.prototype.scrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value() {} });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function claude(patch: Partial<ClaudeConnectionState> = {}, id = 'claude-one'): AgentConfiguration {
  return { ...configuration(id), provider: 'claude', claude: { revision: 0, scope: 'presence-only', status: 'not-configured', busy: false, configured: false,
    observedRuns: 0, launchers: 0, preview: null, launchCommand: null, canConfigure: true, canResume: false, notice: 'none', ...patch } };
}
const preview = { id: 'claude-plan', executable: '/synthetic/bin/claude', directory: '/synthetic/private/claude-one', files: ['/synthetic/private/claude-one/launch.cjs', '/synthetic/private/claude-one/plugin/.claude-plugin/plugin.json', '/synthetic/private/claude-one/connection.json'] };
async function mount(record = claude()) {
  const test = managementBridge([record]); const user = userEvent.setup();
  function update(patch: Partial<ClaudeConnectionState>) { const next = { ...test.configs(), revision: test.configs().revision + 1, records: test.configs().records.map(value => value.id === record.id ? { ...value, claude: { ...value.claude!, ...patch } } : value) }; test.pushConfigs(next); return next; }
  test.bridge.configurations.preview.mockImplementation(async () => update({ preview }));
  test.bridge.configurations.cancel.mockImplementation(async () => update({ preview: null }));
  test.bridge.configurations.confirm.mockImplementation(async () => update({ preview: null, configured: true, canConfigure: false, status: 'waiting', launchCommand: 'node /synthetic/private/claude-one/launch.cjs' }));
  const view = render(<ManagementApp bridge={test.bridge} />); await act(async () => {});
  await user.click(screen.getByRole('tab', { name: '连接' }));
  return { ...test, ...view, user, update };
}
describe('Claude formal connection controls', () => {
  it('previews an explicit legacy task upgrade, lists changed files/events and leaves cancellation reversible', async () => {
    const test = await mount(claude({ mode: 'normal-start', configured: true, status: 'observing', observedRuns: 1,
      canConfigure: false, canUpgrade: true }));
    const taskPreview = { ...preview, operation: 'upgrade' as const, events: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'Stop'],
      files: ['/synthetic/private/claude-one/observer.cjs', '/synthetic/private/claude-one/hook.json', '/synthetic/private/claude-one/upgrade-before.json'],
      settings: { path: '/isolated/settings.json', exists: true, canApply: true, reason: '' } };
    test.bridge.configurations.preview.mockImplementationOnce(async () => test.update({ preview: taskPreview }));
    await test.user.click(screen.getByRole('button', { name: '启用任务反馈' }));
    expect(test.bridge.configurations.preview).toHaveBeenCalledExactlyOnceWith('claude-one');
    const dialog = screen.getByRole('dialog', { name: '确认 Claude Code 任务反馈设置' });
    expect(dialog.textContent).toContain('保留你的原有配置'); expect(dialog.textContent).toContain('SessionEnd、UserPromptSubmit、PreToolUse、Stop');
    expect(dialog.textContent).toContain('启用后请新开 Claude 会话'); expect(dialog.textContent).toContain('最初的原配置备份保持不变');
    expect(dialog.textContent).toContain('/synthetic/private/claude-one/upgrade-before.json');
    expect(dialog.textContent).toContain('短暂反馈'); expect(dialog.textContent).toContain('任务完成、取消和等待操作暂不判断');
    await test.user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '启用任务反馈' })).toBeTruthy();
    expect(screen.getByText('Claude Code 已连接，宠物可以陪伴你。')).toBeTruthy();
  });
  it('confirms task upgrade through the existing consent API and requests a new Claude session', async () => {
    const test = await mount(claude({ mode: 'normal-start', configured: true, status: 'waiting', canConfigure: false, canUpgrade: true }));
    const taskPreview = { ...preview, operation: 'upgrade' as const, events: ['SessionStart', 'Stop'],
      settings: { path: '/isolated/settings.json', exists: true, canApply: true, reason: '' } };
    test.bridge.configurations.preview.mockImplementationOnce(async () => test.update({ preview: taskPreview }));
    test.bridge.configurations.confirm.mockImplementationOnce(async () => test.update({ preview: null, canUpgrade: false, scope: 'task-events' }));
    await test.user.click(screen.getByRole('button', { name: '启用任务反馈' }));
    await test.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认并启用任务反馈' }));
    expect(test.bridge.configurations.confirm).toHaveBeenCalledExactlyOnceWith('claude-one', 'claude-plan');
    expect(screen.getByText('设置已完成，请新开 Claude 会话。之后照常在终端运行 claude 即可。')).toBeTruthy();
    expect(screen.getByText('支持读取、修改、查找、运行命令后的短暂反馈，以及出错提醒。任务完成、取消和等待操作暂不判断。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '启用任务反馈' })).toBeNull();
  });
  it('configures normal startup once with exact settings consent and never shows a special command', async () => {
    const test = await mount(claude({ mode: 'normal-start' }));
    const normalPreview = { ...preview, settings: { path: '/isolated/project-one/settings.json', exists: true, canApply: true, reason: '' } };
    test.bridge.configurations.preview.mockImplementationOnce(async () => test.update({ preview: normalPreview }));
    await test.user.click(screen.getByRole('button', { name: '设置连接' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('将更新的配置文件')).toBeTruthy();
    expect(within(dialog).getAllByTitle(normalPreview.settings.path)).toHaveLength(2);
    expect(dialog.textContent).toContain('追加一条 Agent Pet 的 SessionStart hook');
    expect(dialog.textContent).toContain('原有设置和 hooks 会保留');
    expect(dialog.textContent).not.toContain('不会修改 ~/.claude');
    await test.user.click(within(dialog).getByText('查看文件与权限'));
    expect(dialog.textContent).toContain('已有配置文件保留原权限');
    expect(dialog.textContent).toContain('不读取命令参数或对话内容');
    expect(dialog.textContent).toContain('不会启动或重新加载 Claude Code');
    await test.user.click(within(dialog).getByRole('button', { name: '确认并设置连接' }));
    expect(test.bridge.configurations.confirm).toHaveBeenCalledExactlyOnceWith('claude-one', 'claude-plan');
    expect(screen.getByText('配置已完成，照常在终端运行 claude 即可。首次设置后请新开 Claude 会话。')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '终端启动命令' })).toBeNull();
    expect(screen.queryByRole('button', { name: '复制命令' })).toBeNull();
    expect(test.bridge.piConnection.confirm).not.toHaveBeenCalled();
  });
  it.each([false, true])('blocks unsafe or absent normal settings preview and keeps cancellation available (missing=%s)', async missing => {
    const test = await mount(claude({ mode: 'normal-start' }));
    const blockedPreview = missing ? preview : { ...preview, settings: { path: '/isolated/project-one/settings.json', exists: true, canApply: false, reason: '配置文件无法安全更新，请检查后重新预览。' } };
    test.bridge.configurations.preview.mockImplementationOnce(async () => test.update({ preview: blockedPreview }));
    await test.user.click(screen.getByRole('button', { name: '设置连接' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '确认并设置连接' }).hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByRole('alert').textContent).toContain(missing ? '无法安全更新配置文件' : '配置文件无法安全更新');
    await test.user.click(within(dialog).getByRole('button', { name: '确认并设置连接' }));
    expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
    await test.user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(test.bridge.configurations.cancel).toHaveBeenCalledExactlyOnceWith('claude-one');
  });
  it('describes native normal connection, pause/resume and own hook removal without launcher instructions', async () => {
    const test = await mount(claude({ mode: 'normal-start', configured: true, status: 'observing', observedRuns: 1, canConfigure: false }));
    expect(screen.getByRole('heading', { name: '已连接' })).toBeTruthy();
    expect(screen.getByText('Claude Code 已连接，宠物可以陪伴你。')).toBeTruthy();
    await test.user.click(screen.getByText('更多操作', { exact: true }));
    test.bridge.configurations.disable.mockImplementationOnce(async () => test.update({ status: 'disabled', canResume: true, notice: 'disabled', observedRuns: 0 }));
    await test.user.click(screen.getByRole('button', { name: '暂停连接' }));
    expect(screen.getByText('观察已暂停，连接材料会保留，不影响 Claude Code 运行。')).toBeTruthy();
    test.bridge.configurations.resume.mockImplementationOnce(async () => test.update({ status: 'waiting', canResume: false, notice: 'none' }));
    await test.user.click(screen.getByRole('button', { name: '继续连接' }));
    expect(screen.getByText(/配置已完成，照常在终端运行 claude/)).toBeTruthy();
    expect(screen.queryByText(/用命令打开/)).toBeNull();
    await test.user.click(screen.getByRole('button', { name: '移除连接' }));
    const dialog = screen.getByRole('dialog'); await test.user.click(within(dialog).getByText('会移除什么？'));
    expect(dialog.textContent).toContain('只撤回本应用添加的 hook 条目');
    expect(dialog.textContent).toContain('保留原有 hooks、其他设置和用户文件');
    expect(dialog.textContent).toContain('已加载的配置仍可能调用观察助手');
    expect(dialog.textContent).toContain('私有运行材料会保留');
    expect(test.bridge.configurations.remove).not.toHaveBeenCalled();
  });
  it('previews exact private files in a modal and only confirms the selected plan', async () => {
    const test = await mount();
    expect(screen.queryByText(/pi 已在运行/)).toBeNull(); expect(screen.queryByRole('button', { name: '检查位置' })).toBeNull();
    await test.user.click(screen.getByRole('button', { name: '设置连接' }));
    expect(test.bridge.configurations.preview).toHaveBeenCalledExactlyOnceWith('claude-one');
    const dialog = screen.getByRole('dialog', { name: '确认 Claude Code 连接设置' });
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' })));
    const details = within(dialog).getByText('查看文件与权限').closest('details')!;
    expect(details.hasAttribute('open')).toBe(false);
    await test.user.click(within(dialog).getByText('查看文件与权限'));
    expect(details.textContent).toContain('0700'); expect(details.textContent).toContain('0600');
    for (const path of preview.files) expect(within(dialog).getByTitle(path)).toBeTruthy();
    expect(dialog.textContent).toContain('不会修改 ~/.claude、用户 hooks 或 shell 配置');
    expect(dialog.textContent).toContain('不会启动或重新加载 Claude Code');
    expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
    await test.user.click(within(dialog).getByRole('button', { name: '确认并准备连接' }));
    expect(test.bridge.configurations.confirm).toHaveBeenCalledExactlyOnceWith('claude-one', 'claude-plan');
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByRole('heading', { name: '等待启动' })).toBeTruthy();
    const command = screen.getByRole('textbox', { name: '终端启动命令' }) as HTMLInputElement;
    expect(command.readOnly).toBe(true); expect(command.value).toBe('node /synthetic/private/claude-one/launch.cjs');
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await test.user.click(screen.getByRole('button', { name: '复制命令' }));
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(command.value); expect(screen.getByText('命令已复制')).toBeTruthy();
    expect(test.bridge.piConnection.confirm).not.toHaveBeenCalled();
  });
  it('cancels with button, Escape and backdrop without a confirm, restoring focus', async () => {
    const test = await mount(); const trigger = screen.getByRole('button', { name: '设置连接' });
    for (const method of ['button', 'escape', 'backdrop']) {
      await test.user.click(trigger); const dialog = screen.getByRole('dialog');
      if (method === 'button') await test.user.click(within(dialog).getByRole('button', { name: '取消' }));
      else if (method === 'escape') fireEvent(dialog, new Event('cancel', { cancelable: true }));
      else await test.user.click(dialog);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    }
    expect(test.bridge.configurations.cancel).toHaveBeenCalledTimes(3); expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
  });
  it('keeps pending confirmation modal and reports a failed result with a recovery action', async () => {
    const test = await mount(); await test.user.click(screen.getByRole('button', { name: '设置连接' }));
    let finish!: () => void;
    test.bridge.configurations.confirm.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve; }); return test.update({ notice: 'stale-preview' }); });
    await test.user.click(screen.getByRole('button', { name: '确认并准备连接' }));
    const dialog = screen.getByRole('dialog'); fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBe(dialog); expect(within(dialog).getByRole('button', { name: '取消' }).hasAttribute('disabled')).toBe(true);
    await act(async () => finish());
    expect(within(dialog).getByRole('alert').textContent).toContain('请重新查看设置');
    await test.user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(test.bridge.configurations.cancel).toHaveBeenCalledExactlyOnceWith('claude-one');
  });
  it('restores focus after Main clears a canceled preview before the IPC reply releases busy', async () => {
    const test = await mount(); const trigger = screen.getByRole('button', { name: '设置连接' });
    await test.user.click(trigger);
    let finish!: () => void;
    test.bridge.configurations.cancel.mockImplementationOnce(async () => { test.update({ preview: null }); await new Promise<void>(resolve => { finish = resolve; }); return test.configs(); });
    await test.user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(trigger.hasAttribute('disabled')).toBe(true);
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    await act(async () => finish());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it('shows presence only from observing, and pause, resume and removal use the configuration identity', async () => {
    const test = await mount(claude({ configured: true, status: 'observing', canConfigure: false, observedRuns: 2, launchers: 2 }));
    expect(screen.getByRole('heading', { name: '观察已连接' })).toBeTruthy();
    await test.user.click(screen.getByRole('tab', { name: '首页' }));
    expect(screen.getByText('配置 claude-one：陪伴中 · 任务状态暂不可用')).toBeTruthy();
    await test.user.click(screen.getByRole('tab', { name: '连接' })); await test.user.click(screen.getByText('更多操作', { exact: true }));
    test.bridge.configurations.disable.mockImplementationOnce(async () => test.update({ status: 'disabled', canResume: true, observedRuns: 0 }));
    await test.user.click(screen.getByRole('button', { name: '暂停连接' })); expect(test.bridge.configurations.disable).toHaveBeenCalledExactlyOnceWith('claude-one');
    expect(screen.getByRole('heading', { name: '已暂停' })).toBeTruthy();
    await test.user.click(screen.getByRole('tab', { name: '首页' })); expect(screen.queryByText('配置 claude-one：陪伴中 · 任务状态暂不可用')).toBeNull();
    await test.user.click(screen.getByRole('tab', { name: '连接' })); await test.user.click(screen.getByRole('button', { name: '继续连接' }));
    expect(test.bridge.configurations.resume).toHaveBeenCalledExactlyOnceWith('claude-one');
    await test.user.click(screen.getByRole('button', { name: '移除连接' })); const dialog = screen.getByRole('dialog');
    await test.user.click(within(dialog).getByText('会移除什么？')); expect(dialog.textContent).toContain('运行材料会保留'); expect(dialog.textContent).not.toContain('/reload');
    await test.user.click(within(dialog).getByRole('button', { name: '确认移除' })); expect(test.bridge.configurations.remove).toHaveBeenCalledExactlyOnceWith('claude-one');
  });
  it('adds the actual Claude configuration folder and defers settings inspection to connection preview', async () => {
    const test = await mount(); await test.user.click(screen.getByRole('button', { name: '手动添加' }));
    const dialog = screen.getByRole('dialog'); await test.user.click(within(dialog).getByRole('button', { name: '选择位置' }));
    await test.user.click(within(dialog).getByRole('button', { name: '验证配置' }));
    await test.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Agent 类型' }), 'claude');
    expect(within(dialog).getByRole('option', { name: 'Claude Code（支持 CLI 连接）' })).toBeTruthy();
    expect(within(dialog).getByRole('status').textContent).toContain('添加后再选择 Claude Code 程序');
    expect(within(dialog).getByRole('status').textContent).toContain('通常为 ~/.claude');
    expect(within(dialog).getByRole('status').textContent).toContain('仅对该项目生效');
    expect(within(dialog).getByRole('status').textContent).toContain('现在不读取或改动设置');
    expect(test.bridge.locations.inspect).not.toHaveBeenCalled();
    await test.user.click(within(dialog).getByRole('button', { name: '下一步' })); await test.user.click(within(dialog).getByRole('button', { name: '添加配置' }));
    expect(test.bridge.configurations.create).toHaveBeenCalledExactlyOnceWith({ name: '个人配置', provider: 'claude', targetPath: '/isolated/new-project' });
    expect(test.bridge.configurations.preview).not.toHaveBeenCalled();
  });
});

const discoveredClaude = { id: 'found-claude', entryPath: '/synthetic/nvm/bin/claude', executable: '/synthetic/npm/bin/claude.exe', kind: 'npm' as const, version: '2.1.301', compatibility: 'verified' as const };
it('takes a discovered Claude straight to its existing write preview, with no folder or executable picker', async () => {
  const test = await mount(claude({ mode: 'normal-start' }));
  const targetPath = '/synthetic/.claude';
  test.bridge.configurations.detectClaude.mockResolvedValueOnce({ installations: [discoveredClaude], targetPath, scan: 'complete', notice: 'none' });
  test.bridge.piPreflight.detect.mockResolvedValueOnce({ ...await test.bridge.piPreflight.getState(), installations: [] });
  const record = { ...claude({ mode: 'normal-start', preview: { ...preview, settings: { path: targetPath + '/settings.json', exists: true, canApply: true, reason: '' } } }, 'auto-claude'), targetPath };
  test.bridge.configurations.prepareDetectedClaude.mockImplementationOnce(async () => {
    const next = { ...test.configs(), revision: test.configs().revision + 1, records: [...test.configs().records, record] };
    test.pushConfigs(next); return { state: next, configurationId: record.id };
  });
  await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
  const card = screen.getByRole('article', { name: 'Claude Code 默认配置' });
  await test.user.click(within(card).getByRole('button', { name: '一键配置' }));
  const consent = screen.getByRole('dialog', { name: '连接 Claude Code' });
  expect(consent.textContent).toContain(targetPath);
  expect(test.bridge.configurations.prepareDetectedClaude).not.toHaveBeenCalled();
  await test.user.click(within(consent).getByRole('button', { name: '检查并预览' }));
  expect(test.bridge.configurations.prepareDetectedClaude).toHaveBeenCalledExactlyOnceWith(discoveredClaude.id, expect.any(String));
  expect(screen.getByRole('dialog').textContent).toContain('追加一条 Agent Pet 的 SessionStart hook');
  expect(test.bridge.locations.choose).not.toHaveBeenCalled(); expect(test.bridge.configurations.preview).not.toHaveBeenCalled();
  expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
});
it('keeps unverified native installs visible but disabled, and opens an existing default without creating it again', async () => {
  const test = await mount(claude({ mode: 'normal-start' }));
  const state = { installations: [{ ...discoveredClaude, kind: 'native' as const, compatibility: 'unverified' as const, version: null }], targetPath: '/synthetic/.claude', scan: 'complete' as const, notice: 'none' as const };
  test.bridge.configurations.detectClaude.mockResolvedValueOnce(state);
  await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
  let card = screen.getByRole('article', { name: 'Claude Code 默认配置' });
  expect(within(card).getByRole('button', { name: '一键配置' }).hasAttribute('disabled')).toBe(true);
  expect(within(card).getByText('已找到 Claude，当前安装的兼容性尚未确认。')).toBeTruthy();
  test.bridge.configurations.detectClaude.mockResolvedValueOnce({ ...state, installations: [discoveredClaude, { ...discoveredClaude, id: 'another-verified' }], targetPath: test.configs().records[0]!.targetPath });
  await test.user.click(screen.getByRole('button', { name: '重新扫描' }));
  card = screen.getByRole('article', { name: 'Claude Code 默认配置' });
  expect(within(card).queryByRole('combobox')).toBeNull();
  await test.user.click(within(card).getByRole('button', { name: '查看配置' }));
  expect(screen.getByRole('button', { name: '设置连接' })).toBeTruthy();
  expect(test.bridge.configurations.create).not.toHaveBeenCalled();
  expect(test.bridge.configurations.prepareDetectedClaude).not.toHaveBeenCalled();
});
it('lets users choose between verified Claude installations rather than silently preferring an NVM version', async () => {
  const test = await mount();
  test.bridge.configurations.detectClaude.mockResolvedValueOnce({ installations: [discoveredClaude, { ...discoveredClaude, id: 'other-claude', entryPath: '/synthetic/other/bin/claude' }], targetPath: '/synthetic/.claude', scan: 'complete', notice: 'none' });
  await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
  await test.user.selectOptions(screen.getByRole('combobox', { name: 'Claude 程序安装' }), 'other-claude');
  await test.user.click(within(screen.getByRole('article', { name: 'Claude Code 默认配置' })).getByRole('button', { name: '一键配置' }));
  await test.user.click(screen.getByRole('button', { name: '检查并预览' }));
  expect(test.bridge.configurations.prepareDetectedClaude).toHaveBeenCalledExactlyOnceWith('other-claude', expect.any(String));
});
