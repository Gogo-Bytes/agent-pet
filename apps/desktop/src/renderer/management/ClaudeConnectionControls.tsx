import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AgentConfiguration, ConfigurationsApi, ConfigurationsState } from '../../shared/configurations.js';
import type { ClaudeConnectionState } from '../../shared/claude-connection.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';
import './claude-connection.css';

export function claudeConnectionSummary(state: ClaudeConnectionState | undefined): { title: string; description: string; tone: 'online' | 'waiting' | 'quiet' | 'error' } {
  const normal = state?.mode === 'normal-start';
  switch (state?.status) {
    case 'observing': return { title: normal ? '已连接' : '观察已连接', description: normal ? 'Claude Code 已连接，宠物可以陪伴你。' : '已观察到新打开的 Claude Code。', tone: 'online' };
    case 'waiting': return { title: '等待启动', description: normal ? '配置已完成，照常在终端运行 claude 即可。首次设置后请新开 Claude 会话。' : '请在终端运行命令，打开新的 Claude Code。', tone: 'waiting' };
    case 'disabled': return { title: '已暂停', description: '观察已暂停，Claude Code 可以继续运行。', tone: 'quiet' };
    case 'disconnected': return { title: '已断开', description: 'Agent Pet 已断开，Claude Code 可继续运行。', tone: 'quiet' };
    case 'failed': return { title: '连接需要处理', description: '请查看提示，已有文件会保留。', tone: 'error' };
    default: return { title: '还未连接', description: normal ? '设置一次后，照常在终端运行 claude 即可连接。' : '准备连接材料后，由你在终端打开 Claude Code。', tone: 'quiet' };
  }
}

const notices: Record<ClaudeConnectionState['notice'], string> = {
  none: '', 'choose-executable': '请选择 Claude Code 程序。此操作只检查程序路径，不会启动 Claude Code。',
  'unsupported-installation': '请选择 npm 安装的 Claude Code 2.1.301；其他版本或安装方式暂未验证。',
  'preview-failed': '无法准备设置预览，请重新选择程序后重试。已有文件会保留。',
  'stale-preview': '这份预览已失效，请重新查看设置后再确认。',
  'save-failed': '未能确认保存成功。已有文件会保留，请重新打开 Agent Pet 后检查。',
  'start-failed': '无法开始观察。连接材料会保留，请重新打开 Agent Pet 后重试。',
  'resume-required': '连接材料已保存，请点击重新连接。恢复后请用命令打开新的 Claude Code。',
  retained: '连接材料已保留，正在运行的 Claude Code 不受影响。',
  disabled: '观察已暂停，连接材料会保留。点击继续连接后，请打开新的 Claude Code。',
  disconnected: '观察已断开。请重新连接后，用命令打开新的 Claude Code。',
  'saved-invalid': '保存的连接信息无法安全使用。请检查原文件；本应用不会覆盖或删除已有文件。',
};

export function ClaudeConnectionControls({ record, api, run, busy, visible, statusHeadingRef, error }: {
  record: AgentConfiguration; api: ConfigurationsApi; run: (action: () => Promise<ConfigurationsState>) => Promise<boolean>;
  busy: boolean; visible: boolean; error: string; statusHeadingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const state = record.claude;
  const normal = state?.mode === 'normal-start';
  const summary = claudeConnectionSummary(state);
  const disabled = busy || !!state?.busy;
  const configure = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const previousPreview = useRef<string | null>(null);
  const pendingFocus = useRef<'preview' | 'return' | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const preview = state?.preview;
  useEffect(() => {
    if ((preview?.id ?? null) !== previousPreview.current) pendingFocus.current = preview ? 'preview' : previousPreview.current ? 'return' : null;
    previousPreview.current = preview?.id ?? null;
    if (!visible || disabled || !pendingFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const target = pendingFocus.current === 'preview' ? cancel.current : configure.current ?? statusHeadingRef.current;
      target?.focus({ preventScroll: true });
      if (document.activeElement === target) pendingFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [preview, disabled, visible, statusHeadingRef]);
  useEffect(() => { setCopyStatus(''); }, [state?.launchCommand]);
  const normalNotices: Partial<Record<ClaudeConnectionState['notice'], string>> = {
    'resume-required': '连接设置已保存，请点击重新连接。之后照常打开 Claude Code 即可。',
    disabled: '观察已暂停，连接材料会保留，不影响 Claude Code 运行。',
    disconnected: '观察已断开。请重新连接，之后照常打开 Claude Code 即可。',
  };
  const notice = state?.notice && (normal ? normalNotices[state.notice] ?? notices[state.notice] : notices[state.notice]);
  const blocked = normal && preview && (!preview.settings || !preview.settings.canApply);
  const previewFiles = [...new Set([...(preview?.files ?? []), ...(normal && preview?.settings ? [preview.settings.path] : [])])];
  async function copy() {
    if (!state?.launchCommand) return;
    try { await navigator.clipboard.writeText(state.launchCommand); setCopyStatus('命令已复制'); }
    catch { setCopyStatus('无法复制，请选择命令后手动复制。'); }
  }
  async function resume() {
    if (await run(() => api.resume(record.id))) requestAnimationFrame(() => statusHeadingRef.current?.focus({ preventScroll: true }));
  }
  return <div className="cfg-deployment cfg-claude">
    <div className={`cfg-connection-status cfg-connection-${summary.tone}`}><div><p>{summary.description}</p></div>
      {state?.canResume && <button className="cfg-primary" disabled={disabled} onClick={() => void resume()}>{state.status === 'disabled' ? '继续连接' : '重新连接'}</button>}
      {state?.canConfigure && <button ref={configure} hidden={!!preview} className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.preview(record.id))}>设置连接</button>}
    </div>
    <p className="cfg-claude-scope">当前支持 CLI 连接与退出，任务动作和完成提醒尚未启用。</p>
    {normal && state?.status === 'waiting' && <details className="cfg-operation-help"><summary>运行后还没连接？</summary><p>首次设置或重新打开 Agent Pet 后，请新开 Claude 会话，并确认当前目录已获信任、没有禁用 hooks。已有会话不会自动接入。</p></details>}
    {notice && <p className="cfg-connection-notice" role={summary.tone === 'error' ? 'alert' : 'status'}>{notice}</p>}
    {!normal && state?.configured && state.launchCommand && <div className="cfg-claude-launch">
      <label htmlFor="claude-launch-command">终端启动命令</label><div className="cfg-claude-command"><input id="claude-launch-command" readOnly spellCheck={false} value={state.launchCommand} title={state.launchCommand} onFocus={event => event.target.select()} /><button className="cfg-secondary" onClick={() => void copy()}>复制命令</button></div>
      <p>请在终端运行命令，打开新的 Claude Code。已有进程不会被接管。</p>{copyStatus && <p role="status">{copyStatus}</p>}
    </div>}
    {preview && visible && <Dialog label="确认 Claude Code 连接设置" initialFocusRef={cancel} className="cfg-page cfg-dialog cfg-compact-dialog cfg-claude-preview" onClose={() => { if (!disabled) void run(() => api.cancel(record.id)); }}>
      <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="flower" /></span><h2>连接 Claude Code</h2></div><button className="cfg-dialog-close" aria-label="取消连接设置" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}><Icon name="close" /></button></header>
        <section className="cfg-dialog-body"><p>{normal ? '确认后，在以下配置文件中追加一条 Agent Pet 的 SessionStart hook。原有设置和 hooks 会保留。设置一次后，照常在终端运行 claude 即可。' : '只在 Agent Pet 专用文件夹保存连接材料。确认后，由你在终端运行命令，打开新的 Claude Code。'}</p>
          {normal && preview.settings && <><span className="cfg-section-label">{preview.settings.exists ? '将更新的配置文件' : '将新建的配置文件'}</span><code className="cfg-file-path" title={preview.settings.path}>{preview.settings.path}</code></>}
          <span className="cfg-section-label">Claude Code 程序</span><code className="cfg-file-path" title={preview.executable}>{preview.executable}</code>
          <details className="cfg-operation-help"><summary>查看文件与权限</summary><p>{normal ? '确认后仅追加本应用 hook，并在以下专用目录保存连接文件、私有信息及一份原配置备份。备份不会自动覆盖你的后续修改：' : '将在以下专用目录保存入口、插件和私有连接信息：'}</p><code className="cfg-file-path" title={preview.directory}>{preview.directory}</code><ul className="cfg-claude-files">{previewFiles.map(path => <li key={path}><code title={path}>{path}</code></li>)}</ul><p>专用目录权限为 0700，私有文件为 0600。{normal && '已有配置文件保留原权限。'}退出后保留，{normal ? '下次打开 Agent Pet 会自动恢复连接；主动暂停的连接保持暂停。' : '下次打开 Agent Pet 需要你重新连接。'}</p>{normal && <p>观察助手只读核对 hook 的进程祖先和对应 Claude 进程身份，不读取命令参数或对话内容。</p>}</details>
          <p>{normal ? '不会改动原有 hooks 或 shell 配置，也不会启动或重新加载 Claude Code。首次设置后请新开 Claude 会话。暂停不删除 hook；移除连接仅撤回本应用的 hook 条目，运行材料会保留。' : '不会修改 ~/.claude、用户 hooks 或 shell 配置，也不会启动或重新加载 Claude Code。暂停或移除连接会保留运行材料，不影响正在运行的 Claude Code。'}</p>
          <p>当前支持 CLI 连接与退出，任务动作和完成提醒尚未启用。</p>
          {blocked && <p role="alert">{preview.settings?.reason || '无法安全更新配置文件。请返回检查配置位置后重新预览。'}</p>}
          {(error || notice) && <p role="alert">{error || notice}</p>}
        </section><footer className="cfg-dialog-footer"><div><button ref={cancel} className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}>取消</button><button className="cfg-primary" disabled={disabled || !!blocked} onClick={() => void run(() => api.confirm(record.id, preview.id))}>{disabled ? '正在保存…' : normal ? '确认并设置连接' : '确认并准备连接'}</button></div></footer>
      </div>
    </Dialog>}
  </div>;
}
