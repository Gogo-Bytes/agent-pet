import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AgentConfiguration, ConfigurationsApi, ConfigurationsState } from '../../shared/configurations.js';
import type { ClaudeConnectionState } from '../../shared/claude-connection.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';
import { FileChanges } from './components/FileChanges.js';
import './claude-connection.css';

export function claudeConnectionSummary(state: ClaudeConnectionState | undefined): { title: string; tone: 'online' | 'waiting' | 'quiet' | 'error' } {
  const normal = state?.mode === 'normal-start';
  switch (state?.status) {
    case 'observing': return { title: normal ? '已连接' : '观察已连接', tone: 'online' };
    case 'waiting': return { title: '等待启动', tone: 'waiting' };
    case 'disabled': return { title: '已暂停', tone: 'quiet' };
    case 'disconnected': return { title: '已断开', tone: 'quiet' };
    case 'failed': return { title: '连接需要处理', tone: 'error' };
    default: return { title: '还未连接', tone: 'quiet' };
  }
}

const notices: Record<ClaudeConnectionState['notice'], string> = {
  none: '', 'choose-executable': '请选择 Claude Code 程序。',
  'unsupported-installation': '请选择 npm 安装的 Claude Code 2.1.301；',
  'preview-failed': '无法准备设置预览，请重新选择程序后重试。',
  'stale-preview': '这份预览已失效，请重新查看设置后再确认。',
  'save-failed': '未能确认保存成功。',
  'start-failed': '无法开始观察。',
  'resume-required': '',
  retained: '连接材料已保留，正在运行的 Claude Code 不受影响。',
  disabled: '',
  disconnected: '',
  'saved-invalid': '',
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
  const upgrading = preview?.operation === 'upgrade';
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
  const notice = state && notices[state.notice];
  const blocked = normal && preview && (!preview.settings || !preview.settings.canApply);
  const previewFiles = [...new Set(preview?.files ?? [])].filter(path => path !== preview?.settings?.path);
  async function copy() {
    if (!state?.launchCommand) return;
    try { await navigator.clipboard.writeText(state.launchCommand); setCopyStatus('命令已复制'); }
    catch { setCopyStatus('无法复制，请选择命令后手动复制。'); }
  }
  async function resume() {
    if (await run(() => api.resume(record.id))) requestAnimationFrame(() => statusHeadingRef.current?.focus({ preventScroll: true }));
  }
  return <div className="cfg-deployment cfg-claude">
    <div className={`cfg-connection-status cfg-connection-${summary.tone}`}>
      {state?.canResume && <button className="cfg-primary" disabled={disabled} onClick={() => void resume()}>{state.status === 'disabled' ? '继续连接' : '重新连接'}</button>}
      {state?.canConfigure && <button ref={configure} hidden={!!preview} className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.preview(record.id))}>设置连接</button>}
      {normal && state?.canUpgrade && <button ref={configure} hidden={!!preview} className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.preview(record.id))}>启用任务反馈</button>}
    </div>
    {notice && !preview && <p className="cfg-connection-notice" role={summary.tone === 'error' ? 'alert' : 'status'}>{notice}</p>}
    {!normal && state?.configured && state.launchCommand && <div className="cfg-claude-launch">
      <label htmlFor="claude-launch-command">终端启动命令</label><div className="cfg-claude-command"><input id="claude-launch-command" readOnly spellCheck={false} value={state.launchCommand} title={state.launchCommand} onFocus={event => event.target.select()} /><button className="cfg-secondary" onClick={() => void copy()}>复制命令</button></div>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </div>}
    {preview && visible && <Dialog label={upgrading ? '确认 Claude Code 任务反馈设置' : '确认 Claude Code 连接设置'} initialFocusRef={cancel} className="cfg-page cfg-dialog cfg-compact-dialog cfg-claude-preview" onClose={() => { if (!disabled) void run(() => api.cancel(record.id)); }}>
      <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="flower" /></span><h2>{upgrading ? '启用任务反馈' : '连接 Claude Code'}</h2></div><button className="cfg-dialog-close" aria-label="取消连接设置" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}><Icon name="close" /></button></header>
        <section className="cfg-dialog-body">
          {normal && preview.settings && <><span className="cfg-section-label">{preview.settings.exists ? '更新配置' : '新建配置'}</span><code className="cfg-file-path" title={preview.settings.path}>{preview.settings.path}</code></>}
          <FileChanges root={preview.directory} paths={previewFiles} />
          {blocked && <p role="alert">{preview.settings?.reason || '无法安全更新配置文件。'}</p>}
          {(error || notice) && <p role="alert">{error || notice}</p>}
        </section><footer className="cfg-dialog-footer"><div><button ref={cancel} className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}>取消</button><button className="cfg-primary" disabled={disabled || !!blocked} onClick={() => void run(() => api.confirm(record.id, preview.id))}>{disabled ? '正在保存…' : upgrading ? '启用任务反馈' : normal ? '连接' : '准备连接'}</button></div></footer>
      </div>
    </Dialog>}
  </div>;
}
