import { useEffect, useRef, type RefObject } from 'react';
import type { AgentConfiguration, ConfigurationsApi, ConfigurationsState } from '../../shared/configurations.js';
import type { CodexConnectionState } from '../../shared/codex-connection.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';
export function codexConnectionSummary(state: CodexConnectionState | undefined): { title: string; tone: 'online' | 'waiting' | 'quiet' | 'error' } {
  switch (state?.status) {
    case 'observing': return { title: '已连接', tone: 'online' };
    case 'waiting': return { title: '等待活动', tone: 'waiting' };
    case 'disabled': return { title: '已暂停', tone: 'quiet' };
    case 'failed': return { title: '连接需要处理', tone: 'error' };
    default: return { title: '还未连接', tone: 'quiet' };
  }
}
const notices: Record<CodexConnectionState['notice'], string> = {
  none: '', 'rescan-required': '请重新扫描 Codex 安装，然后继续连接。', 'unsupported-installation': '当前仅支持已验证的 Codex standalone 0.163.0 安装。',
  'preview-failed': '无法检查连接设置。', 'stale-preview': '预览已失效，请重新查看设置。',
  'save-failed': '未能确认保存成功。',
  'saved-invalid': '',
  retained: '未能完整移除连接。',
};
export function CodexConnectionControls({ record, api, run, busy, visible, error, statusHeadingRef, onScan }: {
  record: AgentConfiguration; api: ConfigurationsApi; run(action: () => Promise<ConfigurationsState>): Promise<boolean>;
  busy: boolean; visible: boolean; error: string; statusHeadingRef: RefObject<HTMLHeadingElement | null>; onScan(): void;
}) {
  const state = record.codex, preview = state?.preview;
  const summary = codexConnectionSummary(state), disabled = busy || !!state?.busy;
  const needsScan = state?.notice === 'rescan-required' || state?.notice === 'unsupported-installation';
  const cancelButton = useRef<HTMLButtonElement>(null), configureButton = useRef<HTMLButtonElement>(null);
  const previousPreview = useRef<string | null>(null), pendingFocus = useRef<'preview' | 'return' | null>(null);
  useEffect(() => {
    const id = preview?.id ?? null;
    if (id !== previousPreview.current) pendingFocus.current = id ? 'preview' : previousPreview.current ? 'return' : null;
    previousPreview.current = id;
    if (!visible || disabled || !pendingFocus.current) return;
    const target = pendingFocus.current === 'preview' ? cancelButton.current : configureButton.current ?? statusHeadingRef.current;
    if (!target) return;
    const frame = requestAnimationFrame(() => { if (target.isConnected) { target.focus(); pendingFocus.current = null; } });
    return () => cancelAnimationFrame(frame);
  }, [preview?.id, visible, disabled, statusHeadingRef]);
  // Revoking a transient preview never stops an already configured Codex session.
  const apiRef = useRef(api); apiRef.current = api;
  const latestState = useRef(state); latestState.current = state;
  const openingPreview = useRef(false);
  const revokePreview = () => {
    if (openingPreview.current || latestState.current?.preview || latestState.current?.busy)
      void apiRef.current.cancel(record.id).catch(() => {});
  };
  useEffect(() => { if (!visible) revokePreview(); }, [visible, record.id]);
  useEffect(() => () => { revokePreview(); }, [record.id]);
  const openPreview = () => {
    openingPreview.current = true;
    void run(() => api.preview(record.id)).finally(() => { openingPreview.current = false; });
  };
  return <div className="cfg-deployment" data-quiet={state?.status === 'observing'}>
    <div className={`cfg-connection-status cfg-connection-${summary.tone}`}>
      {state?.canConfigure && !preview && <button ref={configureButton} className="cfg-primary" disabled={disabled} onClick={needsScan ? onScan : openPreview}>{needsScan ? '重新扫描' : '设置连接'}</button>}
      {state?.canResume && <button ref={configureButton} className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.resume(record.id))}>{state.status === 'disabled' ? '继续连接' : '重新连接'}</button>}
    </div>
    {state && notices[state.notice] && <p role="alert">{notices[state.notice]}</p>}
    {state?.status === 'waiting' && <p>在 Codex 中审核 <code>/hooks</code></p>}
    {visible && preview && <Dialog label={`连接 ${record.name}`} className="cfg-page cfg-dialog cfg-compact-dialog" initialFocusRef={cancelButton} onClose={() => { if (!disabled) void run(() => api.cancel(record.id)); }}>
      <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="command" /></span><h2>连接「{record.name}」</h2></div><button className="cfg-dialog-close" aria-label="关闭连接预览" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}><Icon name="close" /></button></header>
        <section className="cfg-dialog-body"><code className="cfg-file-path" title={preview.path}>{preview.path}</code><p>{preview.canApply ? `追加 ${preview.events.length} 条通知` : '请检查文件格式、权限、禁用设置或已有条目。'}</p>
          {preview.canApply && preview.addition && <>
            <details className="cfg-operation-help"><summary>通知内容</summary><p>{preview.events.join('、')}</p>
              <p>命令已脱敏，不能直接执行。</p><pre className="cfg-hook-addition">{JSON.stringify(preview.addition, null, 2)}</pre>
            </details>
          </>}
          {error && <p role="alert">{error}</p>}
        </section><footer className="cfg-dialog-footer"><div><button ref={cancelButton} className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}>取消</button><button className="cfg-primary" disabled={disabled || !preview.canApply} onClick={() => void run(() => api.confirm(record.id, preview.id))}>{disabled ? '正在保存…' : '连接'}</button></div></footer>
      </div>
    </Dialog>}
  </div>;
}
