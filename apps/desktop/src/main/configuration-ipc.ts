import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import type { SessionState } from '@agent-pet/domain';
import type { Configurations } from './configurations.js';
import type { PiPreflight } from './pi-preflight.js';
import { configurationName, configurationPath } from './configurations-store.js';
import { assertWindowSender } from './window-trust.js';
import { identifyInstallation, inspectTarget, limits, ReadBudget } from './pi-preflight-files.js';
import { configurationProviders, type CreateConfiguration, type PetBinding } from '../shared/configurations.js';

export function registerConfigurationIpc({ window, configurations, sessions, quitting, preflight }: {
  window: () => BrowserWindow | undefined; configurations: Configurations; sessions: () => SessionState; quitting: () => boolean;
  preflight?: Pick<PiPreflight, 'detectedConfiguration'>;
}) {
  const chosen = new Set<string>();
  let inspectionPending = false;
  let setupPending = false;
  let generation = 0;
  async function canonicalLocation(value: string): Promise<string> {
    // Read only an explicitly selected/approved path. Preserve the no-symlink contract before canonicalizing case.
    let current = '/';
    for (const part of value.split('/').filter(Boolean)) {
      current = join(current, part);
      try { const stat = await lstat(current); if (!stat.isDirectory()) throw new Error('请选择普通配置目录，不使用符号链接。'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return value; throw error; }
    }
    return realpath(value);
  }
  function assert(event: Electron.IpcMainInvokeEvent) { assertWindowSender(window(), event); if (quitting()) throw new Error('Application is quitting'); }
  function id(value: unknown): string { if (typeof value !== 'string' || !value || value.length > 80) throw new TypeError('Invalid configuration id'); return value; }
  function path(value: unknown): string { const valid = configurationPath(value); if (!valid || !chosen.has(valid)) throw new TypeError('Location must be approved in Main'); return valid; }
  ipcMain.handle('management:configurations-state', event => { assert(event); return configurations.snapshot(); });
  ipcMain.handle('management:sessions', event => { assert(event); return sessions(); });
  ipcMain.handle('management:project', event => { assert(event); return shell.openExternal('https://github.com/Gogo-Bytes/agent-pet'); });
  ipcMain.handle('management:location-choose', async event => {
    assert(event); const current = window()!;
    const result = await dialog.showOpenDialog(current, { title: '选择 Agent 配置目录（不是程序或 sessions 目录）', properties: ['openDirectory', 'dontAddToRecent'] });
    if (quitting() || window() !== current || result.canceled) return null;
    const selected = configurationPath(result.filePaths[0]); if (!selected) return null; const canonical = await canonicalLocation(selected); chosen.add(canonical); return canonical;
  });
  ipcMain.handle('management:location-authorize', async (event, value: unknown) => {
    assert(event); const valid = configurationPath(value); if (!valid) throw new TypeError('请输入完整绝对路径。');
    const current = window()!;
    const result = await dialog.showMessageBox(current, { type: 'question', title: '允许检查这个配置位置？',
      message: valid, detail: '只读检查此目录及祖先的安全 metadata、settings.json、extensions/package.json 和固定入口/ignore 的存在。不会读取会话、凭据或对话，也不会写入、启动或控制 Agent。',
      buttons: ['取消', '允许检查'], defaultId: 0, cancelId: 0 });
    if (quitting() || window() !== current || result.response !== 1) return null;
    const canonical = await canonicalLocation(valid); chosen.add(canonical); return canonical;
  });
  ipcMain.handle('management:location-inspect', async (event, location: unknown, provider: unknown) => {
    assert(event); const targetPath = path(location);
    if (!configurationProviders.includes(provider as never)) throw new TypeError('Invalid provider');
    if (provider !== 'pi') return null;
    if (inspectionPending) throw new Error('Inspection busy'); inspectionPending = true;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const target = { path: targetPath, source: 'chosen' as const };
    const read = inspectTarget(target, new ReadBudget(controller.signal)).catch(() => ({ target, findings: ['unreadable' as const] })).finally(() => { inspectionPending = false; });
    try { return await Promise.race([read, new Promise<typeof read extends Promise<infer T> ? T : never>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve({ target, findings: ['budget'] }); }, limits.milliseconds);
    })]); } finally { if (timer) clearTimeout(timer); }
  });
  ipcMain.handle('management:configurations-create', (event, input: CreateConfiguration) => {
    assert(event); if (!input || typeof input !== 'object') throw new TypeError('Invalid configuration');
    const targetPath = path(input.targetPath); return configurations.create({ name: input.name, provider: input.provider, targetPath });
  });
  ipcMain.handle('management:configurations-prepare-detected', async (event, ...args: unknown[]) => {
    assert(event);
    if (args.length !== 1) throw new TypeError('Invalid detected configuration');
    const candidateId = id(args[0]);
    const candidate = preflight?.detectedConfiguration(candidateId);
    if (!candidate) throw new Error('请重新扫描支持的 pi 安装。');
    if (setupPending) throw new Error('配置检查正在进行，请稍候。');
    setupPending = true;
    const current = window()!; const revision = generation;
    const cancelled = () => ({ state: configurations.snapshot(), configurationId: null });
    const active = () => {
      assert(event);
      const latest = preflight?.detectedConfiguration(candidateId);
      return revision === generation && window() === current && current.isVisible() &&
        latest?.installation.path === candidate.installation.path && latest.targetPath === candidate.targetPath;
    };
    try {
      const result = await dialog.showMessageBox(current, { type: 'question', title: '配置检测到的 pi',
        message: candidate.targetPath,
        detail: '已自动匹配 pi 默认配置位置，无需选择文件夹。允许后只读检查此目录及祖先 metadata、settings.json、extensions/package.json 和固定入口/ignore 的存在；不会读取会话、凭据或对话。随后展示部署预览，另行确认后才写入扩展并开始接收。不启动或重载 pi。',
        buttons: ['取消', '检查并预览'], defaultId: 0, cancelId: 0 });
      if (result.response !== 1 || !active()) return cancelled();
      const installation = await identifyInstallation(candidate.installation.path, candidateId);
      if (!active()) return cancelled();
      if (installation?.compatibility !== 'verified-0.85.1') throw new Error('pi 安装已变化，请重新扫描。');
      const targetPath = await canonicalLocation(candidate.targetPath);
      if (!active()) return cancelled();
      const existing = configurations.snapshot().records.find(record => record.provider === 'pi' && record.targetPath === targetPath);
      const created = existing ? configurations.snapshot() : await configurations.create({ name: 'pi 默认配置', provider: 'pi', targetPath, installation });
      if (created.notice !== 'none') return { state: created, configurationId: null };
      const record = created.records.find(value => value.provider === 'pi' && value.targetPath === targetPath);
      if (!record || !active()) return cancelled();
      const state = record.connection?.canConfigure ? await configurations.preview(record.id) : created;
      if (!active()) { await configurations.cancel(record.id); return cancelled(); }
      return { state, configurationId: record.id };
    } finally { setupPending = false; }
  });
  ipcMain.handle('management:configurations-rename', (event, value: unknown, name: unknown) => {
    assert(event); const valid = configurationName(name); if (!valid) throw new TypeError('Invalid name'); return configurations.rename(id(value), valid);
  });
  ipcMain.handle('management:configurations-target', (event, value: unknown, target: unknown) => { assert(event); return configurations.changeTarget(id(value), path(target)); });
  ipcMain.handle('management:configurations-pet', (event, value: unknown, pet: PetBinding | null) => { assert(event); return configurations.bindPet(id(value), pet); });
  const operations = { inspect: (value: string) => configurations.inspect(value), preview: (value: string) => configurations.preview(value),
    cancel: (value: string) => configurations.cancel(value), resume: (value: string) => configurations.resume(value),
    disable: (value: string) => configurations.disable(value), remove: (value: string) => configurations.remove(value) };
  for (const [action, operation] of Object.entries(operations)) ipcMain.handle(`management:configurations-${action}`, (event, value: unknown) => { assert(event); return operation(id(value)); });
  ipcMain.handle('management:configurations-confirm', (event, value: unknown, plan: unknown) => { assert(event); return configurations.confirm(id(value), id(plan)); });
  return { invalidate() { generation++; } };
}
