import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import type { SessionState } from '@agent-pet/domain';
import type { Configurations } from './configurations.js';
import type { PiPreflight } from './pi-preflight.js';
import { inspectClaudeInstallation, type ClaudeDiscovery } from './claude-discovery.js';
import { dirname } from 'node:path';
import { inspectCodexInstallation, type CodexDiscovery } from './codex-discovery.js';
import { configurationName, configurationPath } from './configurations-store.js';
import { assertWindowSender } from './window-trust.js';
import { identifyInstallation, inspectTarget, limits, ReadBudget } from './pi-preflight-files.js';
import { configurationProviders, type CreateConfiguration, type DetectedSetupResult, type PetBinding } from '../shared/configurations.js';

export function registerConfigurationIpc({ window, configurations, sessions, quitting, preflight, claudeDiscovery, codexDiscovery }: {
  window: () => BrowserWindow | undefined; configurations: Configurations; sessions: () => SessionState; quitting: () => boolean;
  preflight?: Pick<PiPreflight, 'detectedConfiguration'>;
  claudeDiscovery?: Pick<ClaudeDiscovery, 'detect' | 'candidate' | 'targetPath' | 'invalidate'>;
  codexDiscovery?: Pick<CodexDiscovery, 'detect' | 'candidate' | 'targetPath' | 'invalidate'>;
}) {
  const chosen = new Set<string>();
  let inspectionPending = false;
  let setupWorkPending = false;
  let setup: { requestId: string; cancel(reason?: 'cancelled' | 'timeout'): void } | undefined;
  let prepared: { requestId: string; configurationId: string; planId: string } | undefined;
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
      message: valid, detail: '只读检查此目录及祖先的安全 metadata、settings.json、hooks.json、extensions/package.json 和固定入口/ignore 的存在；连接预览还会核对所选 Agent 程序及本配置目录中的固定后台程序入口 metadata。不会读取会话、凭据或对话，也不会写入、启动或控制 Agent。',
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
  ipcMain.handle('management:configurations-cancel-detected', async (event, value: unknown) => {
    assert(event); const requestId = id(value);
    if (setup?.requestId === requestId) setup.cancel();
    if (prepared?.requestId === requestId) {
      const record = configurations.snapshot().records.find(value => value.id === prepared!.configurationId);
      if ((record?.codex?.preview?.id ?? record?.claude?.preview?.id ?? record?.connection?.preview?.id) === prepared.planId) await configurations.cancel(record!.id);
      if (prepared?.requestId === requestId) prepared = undefined;
    }
  });
  for (const provider of ['claude', 'codex'] as const) {
    const discovery = provider === 'claude' ? claudeDiscovery : codexDiscovery;
    const label = provider === 'claude' ? 'Claude Code' : 'Codex CLI';
    const inspect = provider === 'claude' ? inspectClaudeInstallation : (entry: string, _home: string, budget: ReadBudget) => inspectCodexInstallation(entry, budget);
    let scanPending = false;
    let scanJob: { requestId: string; cancelled: boolean } | undefined;
    let completedScanId: string | undefined;
  ipcMain.handle(`management:configurations-detect-${provider}`, async (event, ...args: unknown[]) => {
    assert(event); if (args.length !== 1 || !discovery) throw new Error('Installation discovery unavailable');
    const requestId = id(args[0]);
    if (scanPending) throw new Error('扫描正在进行，请稍候。');
    scanPending = true; discovery.invalidate();
    completedScanId = undefined;
    const job = { requestId, cancelled: false }; scanJob = job;
    const current = window()!, revision = generation;
    try {
      const consent = await dialog.showMessageBox(current, { type: 'question', title: `查找 ${label}`,
        message: `允许检查本机的 ${label} 安装？`,
        detail: `只读 GUI PATH（最多 32 项）、~/.local/bin/${provider}、/opt/homebrew/bin/${provider}、/usr/local/bin/${provider}，以及 ~/.nvm/versions/node 一层（最多 64 项、16 个版本）。${provider === 'codex' ? `还会核对 ${discovery.targetPath}/packages/standalone/current 下的 bin/codex 和 codex 入口。` : ''}仅检查程序链接、安全 metadata 和对应 package.json（每个最多 64 KiB）；不执行 Agent，不读取配置、凭据或对话，不安装或修改文件。`,
        buttons: ['取消', '允许扫描'], defaultId: 0, cancelId: 0 });
      if (job.cancelled || consent.response !== 1 || revision !== generation || quitting() || window() !== current || current.isDestroyed() || !current.isVisible()) {
        return { installations: [], targetPath: discovery.targetPath, scan: 'complete', notice: 'cancelled' };
      }
      assert(event); const result = await discovery.detect();
      if (!job.cancelled && revision === generation) completedScanId = requestId;
      return result;
    } finally { scanPending = false; if (scanJob === job) scanJob = undefined; }
  });
  ipcMain.handle(`management:configurations-cancel-${provider}-scan`, (event, value: unknown) => {
    assert(event); const requestId = id(value);
    if (scanJob?.requestId === requestId) scanJob.cancelled = true;
    if (scanJob?.requestId === requestId || completedScanId === requestId) {
      discovery?.invalidate(); completedScanId = undefined;
    }
  });
  ipcMain.handle(`management:configurations-prepare-detected-${provider}`, async (event, ...args: unknown[]) => {
    assert(event);
    if (args.length !== 2 || typeof args[1] !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(args[1])) throw new TypeError('Invalid detected configuration');
    const candidateId = id(args[0]), requestId = args[1];
    const candidate = discovery?.candidate(candidateId);
    if (!candidate) throw new Error(`${label} 安装已变化，请重新扫描。`);
    if (setupWorkPending) throw new Error('配置检查正在结束，请稍候重试。');
    setupWorkPending = true;
    const current = window()!, revision = generation, target = discovery!.targetPath;
    const controller = new AbortController(); let cancelled = false;
    let settle!: (value: DetectedSetupResult) => void;
    const cancellation = new Promise<DetectedSetupResult>(done => { settle = done; });
    const job = { requestId, cancel(reason: 'cancelled' | 'timeout' = 'cancelled') {
      cancelled = true; controller.abort(); settle({ state: configurations.snapshot(), configurationId: null, reason });
    } };
    setup = job;
    const active = () => {
      if (cancelled || revision !== generation || quitting() || window() !== current || current.isDestroyed() || !current.isVisible()) return false;
      assert(event); const latest = discovery?.candidate(candidateId);
      return latest?.executable === candidate.executable && latest.entryPath === candidate.entryPath;
    };
    // The trusted Renderer presents the default target/settings read scope first. Deployment still requires confirm.
    const work = (async (): Promise<DetectedSetupResult> => {
      const stopped = (): DetectedSetupResult => ({ state: configurations.snapshot(), configurationId: null, reason: 'cancelled' });
      const checked = await inspect(candidate.entryPath, dirname(target), new ReadBudget(controller.signal));
      if (!active()) return stopped();
      if (checked?.compatibility !== 'verified' || checked.executable !== candidate.executable) throw new Error(`${label} 安装已变化，请重新扫描。`);
      const targetPath = await canonicalLocation(target);
      if (!active()) return stopped();
      const existing = configurations.snapshot().records.find(record => record.provider === provider && record.targetPath === targetPath);
      const created = existing ? configurations.snapshot() : await configurations.create({ name: label, provider, targetPath });
      if (created.notice !== 'none') return { state: created, configurationId: null };
      const record = created.records.find(value => value.provider === provider && value.targetPath === targetPath);
      if (!record || !active()) return stopped();
      const state = record[provider]?.canConfigure ? await (provider === 'claude' ? configurations.previewDetectedClaude(record.id, candidate.executable) : configurations.previewDetectedCodex(record.id, candidate.executable)) : created;
      const planId = state.records.find(value => value.id === record.id)?.[provider]?.preview?.id;
      if (!active()) {
        if (planId && configurations.snapshot().records.find(value => value.id === record.id)?.[provider]?.preview?.id === planId) await configurations.cancel(record.id);
        return stopped();
      }
      prepared = planId ? { requestId, configurationId: record.id, planId } : undefined;
      return { state, configurationId: record.id };
    })().finally(() => { setupWorkPending = false; });
    const timer = setTimeout(() => job.cancel('timeout'), limits.milliseconds);
    try { return await Promise.race([work, cancellation]); }
    finally { clearTimeout(timer); if (setup === job) setup = undefined; }
  });
  }
  ipcMain.handle('management:configurations-prepare-detected', async (event, ...args: unknown[]) => {
    assert(event);
    if (args.length !== 2 || typeof args[1] !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(args[1])) throw new TypeError('Invalid detected configuration');
    const candidateId = id(args[0]), requestId = args[1];
    const candidate = preflight?.detectedConfiguration(candidateId);
    if (!candidate) throw new Error('请重新扫描支持的 pi 安装。');
    if (setupWorkPending) throw new Error('配置检查正在结束，请稍候重试。');
    setupWorkPending = true;
    const current = window()!; const revision = generation;
    const controller = new AbortController();
    let cancelled = false;
    let settle!: (value: DetectedSetupResult) => void;
    const cancellation = new Promise<DetectedSetupResult>(resolve => { settle = resolve; });
    const job = { requestId, cancel(reason: 'cancelled' | 'timeout' = 'cancelled') {
      cancelled = true; controller.abort();
      settle({ state: configurations.snapshot(), configurationId: null, reason });
    } };
    setup = job;
    const active = () => {
      if (cancelled || revision !== generation || quitting() || window() !== current || current.isDestroyed() || !current.isVisible()) return false;
      assert(event);
      const latest = preflight?.detectedConfiguration(candidateId);
      return latest?.installation.path === candidate.installation.path && latest.targetPath === candidate.targetPath;
    };
    // The trusted renderer presents Main's fixed read scope before invoking this action.
    // IO is single-flight until it settles, even when cancellation releases the IPC reply.
    const work = (async (): Promise<DetectedSetupResult> => {
      const stopped = (): DetectedSetupResult => ({ state: configurations.snapshot(), configurationId: null, reason: 'cancelled' });
      const installation = await identifyInstallation(candidate.installation.path, candidateId, false, new ReadBudget(controller.signal));
      if (!active()) return stopped();
      if (installation?.compatibility !== 'verified-0.85.1') throw new Error('pi 安装已变化，请重新扫描。');
      const targetPath = await canonicalLocation(candidate.targetPath);
      if (!active()) return stopped();
      const existing = configurations.snapshot().records.find(record => record.provider === 'pi' && record.targetPath === targetPath);
      const created = existing ? configurations.snapshot() : await configurations.create({ name: 'pi 默认配置', provider: 'pi', targetPath, installation });
      if (created.notice !== 'none') return { state: created, configurationId: null };
      const record = created.records.find(value => value.provider === 'pi' && value.targetPath === targetPath);
      if (!record || !active()) return stopped();
      const state = record.connection?.canConfigure ? await configurations.preview(record.id) : created;
      const planId = state.records.find(value => value.id === record.id)?.connection?.preview?.id;
      if (!active()) {
        const currentPlan = configurations.snapshot().records.find(value => value.id === record.id)?.connection?.preview?.id;
        if (planId && currentPlan === planId) await configurations.cancel(record.id);
        return stopped();
      }
      prepared = planId ? { requestId, configurationId: record.id, planId } : undefined;
      return { state, configurationId: record.id };
    })().finally(() => { setupWorkPending = false; });
    const timer = setTimeout(() => job.cancel('timeout'), limits.milliseconds);
    try { return await Promise.race([work, cancellation]); }
    finally { clearTimeout(timer); if (setup === job) setup = undefined; }
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
  return { invalidate() { generation++; setup?.cancel(); claudeDiscovery?.invalidate(); codexDiscovery?.invalidate(); } };
}
